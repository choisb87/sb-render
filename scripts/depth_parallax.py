#!/usr/bin/env python3
"""
Depth-based Parallax Generator
Uses Depth Anything V2 for depth estimation and creates layered parallax video
"""

import sys
import os
import json
import tempfile
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
import torch
from transformers import pipeline

# Global model cache
_depth_estimator = None

def get_depth_estimator():
    """Lazy load depth estimator model"""
    global _depth_estimator
    if _depth_estimator is None:
        print("[DepthParallax] Loading Depth Anything V2 model...", file=sys.stderr)
        _depth_estimator = pipeline(
            task="depth-estimation",
            model="depth-anything/Depth-Anything-V2-Small-hf",
            device="cpu"
        )
        print("[DepthParallax] Model loaded successfully", file=sys.stderr)
    return _depth_estimator

def estimate_depth(image_path: str) -> np.ndarray:
    """Estimate depth from image using Depth Anything V2"""
    estimator = get_depth_estimator()
    image = Image.open(image_path).convert("RGB")

    # Run depth estimation
    result = estimator(image)
    depth_map = np.array(result["depth"])

    # Normalize to 0-1 range
    depth_map = (depth_map - depth_map.min()) / (depth_map.max() - depth_map.min() + 1e-8)

    return depth_map

def create_layer_masks(depth_map: np.ndarray, num_layers: int = 3) -> list:
    """Create mutually exclusive layer masks based on depth
    Each pixel belongs to exactly one layer - no overlap
    """
    masks = []

    # Create thresholds for layers
    # Layer 0 = background (far), Layer N-1 = foreground (near)
    thresholds = np.linspace(0, 1, num_layers + 1)

    for i in range(num_layers):
        low = thresholds[i]
        high = thresholds[i + 1]

        # Hard mask - each pixel belongs to exactly one layer
        if i == num_layers - 1:
            # Last layer includes the upper boundary
            mask = ((depth_map >= low) & (depth_map <= high)).astype(np.float32)
        else:
            mask = ((depth_map >= low) & (depth_map < high)).astype(np.float32)

        masks.append(mask)

    return masks

def create_layer_images(image_path: str, masks: list, output_dir: str) -> list:
    """Create layer images with transparency based on masks"""
    image = Image.open(image_path).convert("RGBA")
    img_array = np.array(image)

    layer_paths = []

    for i, mask in enumerate(masks):
        # Resize mask to match image size
        mask_resized = np.array(Image.fromarray((mask * 255).astype(np.uint8)).resize(
            (img_array.shape[1], img_array.shape[0]),
            Image.Resampling.LANCZOS
        )) / 255.0

        # Apply mask to alpha channel
        layer = img_array.copy()
        layer[:, :, 3] = (mask_resized * 255).astype(np.uint8)

        # Save layer
        layer_path = os.path.join(output_dir, f"layer_{i}.png")
        Image.fromarray(layer).save(layer_path, "PNG")
        layer_paths.append(layer_path)

        print(f"[DepthParallax] Created layer {i}: {layer_path}", file=sys.stderr)

    return layer_paths

def ease_in_out_sine(t: float) -> float:
    """Smooth sine easing function: 0->0, 0.5->0.5, 1->1"""
    return (1 - np.cos(t * np.pi)) / 2

def generate_parallax_video(
    image_path: str,
    output_path: str,
    direction: str = "right",
    intensity: str = "normal",
    duration: float = 5.0,
    fps: int = 24,
    num_layers: int = 3,
    zoom: str = "none"  # "none", "in", "out"
):
    """Generate parallax video with depth-based layer separation
    Uses 2-layer approach with inpainting: background (foreground removed) + foreground (extracted)
    Supports combined zoom + direction effects
    """
    import cv2

    print(f"[DepthParallax] Processing: {image_path}", file=sys.stderr)
    print(f"[DepthParallax] Direction: {direction}, Intensity: {intensity}, Zoom: {zoom}", file=sys.stderr)

    # Get image dimensions
    with Image.open(image_path) as img:
        orig_width, orig_height = img.size
        # Ensure even dimensions
        width = orig_width - (orig_width % 2)
        height = orig_height - (orig_height % 2)

    # Estimate depth
    print("[DepthParallax] Estimating depth...", file=sys.stderr)
    depth_map = estimate_depth(image_path)

    # Create temporary directory for frames
    with tempfile.TemporaryDirectory() as temp_dir:
        # Load base image
        print("[DepthParallax] Preparing 2-layer parallax with inpainting...", file=sys.stderr)
        base_image = Image.open(image_path).convert("RGB")
        base_image = base_image.resize((width, height), Image.Resampling.LANCZOS)

        # Resize depth map to match image
        depth_resized = np.array(Image.fromarray((depth_map * 255).astype(np.uint8)).resize(
            (width, height), Image.Resampling.LANCZOS
        )) / 255.0

        # Create foreground mask: top 60% of depth values (closest objects)
        # Lower percentile = more area included as foreground
        fg_threshold = np.percentile(depth_resized, 40)  # Top 60% is foreground
        fg_mask = (depth_resized >= fg_threshold).astype(np.float32)

        # Apply morphological operations to clean up mask
        from PIL import ImageFilter
        fg_mask_img = Image.fromarray((fg_mask * 255).astype(np.uint8))
        fg_mask_img = fg_mask_img.filter(ImageFilter.GaussianBlur(radius=2))
        fg_mask = np.array(fg_mask_img) / 255.0
        fg_mask = (fg_mask > 0.5).astype(np.float32)

        # Create foreground layer with alpha (with feathered edges)
        base_rgba = np.array(base_image.convert("RGBA"))
        fg_layer = base_rgba.copy()

        # Feather the foreground mask edges for smoother blending
        fg_mask_feathered = cv2.GaussianBlur((fg_mask * 255).astype(np.uint8), (5, 5), 0) / 255.0
        fg_layer[:, :, 3] = (fg_mask_feathered * 255).astype(np.uint8)
        foreground = Image.fromarray(fg_layer)

        # Create inpainted background (foreground removed and filled)
        print("[DepthParallax] Inpainting background...", file=sys.stderr)
        base_cv = cv2.cvtColor(np.array(base_image), cv2.COLOR_RGB2BGR)

        # Dilate the mask more aggressively for hair/fine details
        inpaint_mask = (fg_mask * 255).astype(np.uint8)
        kernel = np.ones((7, 7), np.uint8)
        inpaint_mask = cv2.dilate(inpaint_mask, kernel, iterations=4)

        # Use Telea inpainting algorithm with larger radius
        inpainted = cv2.inpaint(base_cv, inpaint_mask, inpaintRadius=12, flags=cv2.INPAINT_TELEA)
        background_inpainted = cv2.cvtColor(inpainted, cv2.COLOR_BGR2RGB)

        print(f"[DepthParallax] Foreground coverage: {fg_mask.mean()*100:.1f}%", file=sys.stderr)

        # Movement parameters (defined early for padding calculation)
        intensity_mult = {"subtle": 0.5, "normal": 1.0, "dramatic": 1.5}.get(intensity, 1.0)
        bg_speed = 15 * intensity_mult
        fg_speed = 40 * intensity_mult

        print(f"[DepthParallax] Speeds - BG: {bg_speed}, FG: {fg_speed}", file=sys.stderr)

        # Add mirror padding to edges to prevent visible boundaries
        # Use larger padding to ensure no edges are ever visible
        pad_x = int(max(fg_speed, bg_speed) * 3)  # Much larger margin
        pad_y = int(max(fg_speed, bg_speed) * 3)

        # Apply reflect/mirror padding using OpenCV
        background_padded = cv2.copyMakeBorder(
            background_inpainted,
            top=pad_y, bottom=pad_y, left=pad_x, right=pad_x,
            borderType=cv2.BORDER_REFLECT_101
        )

        # Blur the edges to hide any seams from inpainting
        # Create edge mask for blending
        edge_blur_size = 30
        edge_mask = np.ones((background_padded.shape[0], background_padded.shape[1]), dtype=np.float32)
        # Fade out at original image boundaries (where inpainting meets padding)
        edge_mask[:pad_y+edge_blur_size, :] = np.linspace(0, 1, pad_y+edge_blur_size).reshape(-1, 1)
        edge_mask[-(pad_y+edge_blur_size):, :] = np.linspace(1, 0, pad_y+edge_blur_size).reshape(-1, 1)
        for i in range(pad_x+edge_blur_size):
            blend_factor = i / (pad_x+edge_blur_size)
            edge_mask[:, i] = np.minimum(edge_mask[:, i], blend_factor)
            edge_mask[:, -(i+1)] = np.minimum(edge_mask[:, -(i+1)], blend_factor)

        # Apply Gaussian blur to the background and blend at edges
        background_blurred = cv2.GaussianBlur(background_padded, (51, 51), 0)
        edge_mask_3ch = np.stack([edge_mask]*3, axis=-1)
        background_padded = (background_padded * edge_mask_3ch + background_blurred * (1 - edge_mask_3ch)).astype(np.uint8)

        # Convert to PIL and scale up slightly
        bg_scale = 1.1
        padded_h, padded_w = background_padded.shape[:2]
        bg_scaled_w = int(padded_w * bg_scale)
        bg_scaled_h = int(padded_h * bg_scale)
        background_scaled = Image.fromarray(background_padded).resize((bg_scaled_w, bg_scaled_h), Image.Resampling.LANCZOS)

        # Calculate offset to center the scaled background
        bg_center_offset_x = (bg_scaled_w - width) // 2
        bg_center_offset_y = (bg_scaled_h - height) // 2

        # Direction vectors
        if direction == "left":
            dx, dy = -1, 0
        elif direction == "right":
            dx, dy = 1, 0
        elif direction == "up":
            dx, dy = 0, -1
        elif direction == "down":
            dx, dy = 0, 1
        else:
            dx, dy = 0, 0  # No pan direction (zoom only)

        # Zoom parameters
        zoom_amount = 0.15 * intensity_mult  # How much to zoom (15% at normal intensity)
        if zoom == "in":
            zoom_start, zoom_end = 1.0, 1.0 + zoom_amount
        elif zoom == "out":
            zoom_start, zoom_end = 1.0 + zoom_amount, 1.0
        else:
            zoom_start, zoom_end = 1.0, 1.0  # No zoom

        print(f"[DepthParallax] Zoom: {zoom_start:.2f} -> {zoom_end:.2f}", file=sys.stderr)

        # Generate frames
        total_frames = int(duration * fps)
        frame_paths = []

        print(f"[DepthParallax] Generating {total_frames} frames...", file=sys.stderr)

        for frame_idx in range(total_frames):
            # Progress from 0 to 1
            t = frame_idx / max(total_frames - 1, 1)
            # Apply smooth easing
            eased_t = ease_in_out_sine(t)

            # Calculate zoom scale for this frame
            current_zoom = zoom_start + (zoom_end - zoom_start) * eased_t

            # Calculate offsets (start from original position: 0 to 1)
            # Frame 0 = original position, Frame N = full movement
            bg_offset_x = int(dx * bg_speed * eased_t)
            bg_offset_y = int(dy * bg_speed * eased_t)
            fg_offset_x = int(dx * fg_speed * eased_t)
            fg_offset_y = int(dy * fg_speed * eased_t)

            # Create frame from scaled background (crop to output size)
            # The scaled background is larger, so we crop from the center with offset
            crop_x = bg_center_offset_x - bg_offset_x
            crop_y = bg_center_offset_y - bg_offset_y

            # Ensure crop coordinates are within bounds
            crop_x = max(0, min(crop_x, bg_scaled_w - width))
            crop_y = max(0, min(crop_y, bg_scaled_h - height))

            frame = background_scaled.crop((crop_x, crop_y, crop_x + width, crop_y + height)).copy()
            frame = frame.convert("RGBA")

            # Paste foreground on top with proper alpha blending
            frame.paste(foreground, (fg_offset_x, fg_offset_y), foreground)

            # Apply zoom effect if needed
            if current_zoom != 1.0:
                # Scale the frame
                zoomed_w = int(width * current_zoom)
                zoomed_h = int(height * current_zoom)
                frame_zoomed = frame.resize((zoomed_w, zoomed_h), Image.Resampling.LANCZOS)
                # Crop back to original size from center
                left = (zoomed_w - width) // 2
                top = (zoomed_h - height) // 2
                frame = frame_zoomed.crop((left, top, left + width, top + height))

            frame_rgb = frame.convert("RGB")

            # Save frame
            frame_path = os.path.join(temp_dir, f"frame_{frame_idx:05d}.png")
            frame_rgb.save(frame_path, "PNG")
            frame_paths.append(frame_path)

            if frame_idx % 24 == 0:
                print(f"[DepthParallax] Frame {frame_idx}/{total_frames}", file=sys.stderr)

        print("[DepthParallax] Encoding video...", file=sys.stderr)

        # Encode frames to video using FFmpeg
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", os.path.join(temp_dir, "frame_%05d.png"),
            "-c:v", "libx264",
            "-crf", "18",
            "-preset", "medium",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            output_path
        ]

        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"[DepthParallax] FFmpeg error: {result.stderr}", file=sys.stderr)
            raise RuntimeError(f"FFmpeg failed: {result.stderr}")

        print(f"[DepthParallax] Video created: {output_path}", file=sys.stderr)

    return output_path

def main():
    if len(sys.argv) < 3:
        print("Usage: depth_parallax.py <input_image> <output_video> [options_json]", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    # Parse options
    options = {}
    if len(sys.argv) > 3:
        options = json.loads(sys.argv[3])

    direction = options.get("direction", "right")
    intensity = options.get("intensity", "normal")
    duration = options.get("duration", 5.0)
    fps = options.get("fps", 24)
    num_layers = options.get("layerCount", 3)
    zoom = options.get("zoom", "none")  # "none", "in", "out"

    try:
        generate_parallax_video(
            input_path,
            output_path,
            direction=direction,
            intensity=intensity,
            duration=duration,
            fps=fps,
            num_layers=num_layers,
            zoom=zoom
        )
        print(json.dumps({"success": True, "output": output_path}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
