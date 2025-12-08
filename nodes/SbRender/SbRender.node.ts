import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';

import { FileManager } from './services/FileManager';
import { AudioMixer } from './services/AudioMixer';
import { SubtitleEngine } from './services/SubtitleEngine';
import { VideoComposer } from './services/VideoComposer';

import {
  validateParams,
  ValidationError,
} from './utils/validation';

import type {
  ISbRenderNodeParams,
  IAudioMixConfig,
  ISubtitleConfig,
  IVideoMetadata,
} from './interfaces';

import { DEFAULTS as DEFAULT_VALUES } from './interfaces';

/**
 * sb-render Node
 * Render videos with customizable subtitles, BGM, and narration
 */
export class SbRender implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'SB Render',
    name: 'sbRender',
    icon: 'file:sbrender.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Render videos with subtitles, BGM, and narration using FFmpeg',
    defaults: {
      name: 'SB Render',
    },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      // Resource
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Video',
            value: 'Video',
          },
        ],
        default: 'Video',
      },

      // Operation
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['Video'],
          },
        },
        options: [
          {
            name: 'Render',
            value: 'Render',
            description: 'Compose video with audio and subtitles',
            action: 'Render video',
          },
          {
            name: 'Merge',
            value: 'Merge',
            description: 'Merge multiple videos in sequence',
            action: 'Merge videos',
          },
          {
            name: 'Image To Video',
            value: 'ImageToVideo',
            description: 'Create video from multiple images with specified durations',
            action: 'Create video from images',
          },
        ],
        default: 'Render',
      },

      // === VIDEO INPUT SECTION ===
      {
        displayName: 'Video Source',
        name: 'videoSource',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
          },
        },
        options: [
          {
            name: 'URL',
            value: 'url',
          },
          {
            name: 'Binary Data',
            value: 'binary',
          },
        ],
        default: 'url',
        description: 'Source of the video file',
      },

      {
        displayName: 'Video URL',
        name: 'videoUrl',
        type: 'string',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            videoSource: ['url'],
          },
        },
        default: '',
        placeholder: 'https://example.com/video.mp4',
        required: true,
        description: 'URL of the video file to process',
      },

      {
        displayName: 'Video Binary Property',
        name: 'videoBinaryProperty',
        type: 'string',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            videoSource: ['binary'],
          },
        },
        default: 'data',
        required: true,
        placeholder: 'data',
        description: 'Name of the binary property from previous node (usually "data"). NOT the filename.',
      },

      // === BGM SECTION ===
      {
        displayName: 'Enable Background Music (BGM)',
        name: 'enableBGM',
        type: 'boolean',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
          },
        },
        default: false,
        description: 'Whether to add background music to the video',
      },

      {
        displayName: 'BGM Source',
        name: 'bgmSource',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableBGM: [true],
          },
        },
        options: [
          {
            name: 'URL',
            value: 'url',
          },
          {
            name: 'Binary Data',
            value: 'binary',
          },
        ],
        default: 'url',
        description: 'Source of the BGM file',
      },

      {
        displayName: 'BGM URL',
        name: 'bgmUrl',
        type: 'string',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableBGM: [true],
            bgmSource: ['url'],
          },
        },
        default: '',
        placeholder: 'https://example.com/bgm.mp3',
        description: 'URL of the background music file',
      },

      {
        displayName: 'BGM Binary Property',
        name: 'bgmBinaryProperty',
        type: 'string',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableBGM: [true],
            bgmSource: ['binary'],
          },
        },
        default: 'data',
        placeholder: 'data',
        description: 'Name of the binary property containing the BGM',
      },

      {
        displayName: 'BGM Volume',
        name: 'bgmVolume',
        type: 'number',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableBGM: [true],
          },
        },
        typeOptions: {
          minValue: 0,
          maxValue: 100,
        },
        default: 30,
        description: 'Volume of background music (0-100)',
      },

      {
        displayName: 'BGM Fade In (Seconds)',
        name: 'bgmFadeIn',
        type: 'number',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableBGM: [true],
          },
        },
        typeOptions: {
          minValue: 0,
        },
        default: 2,
        description: 'Fade-in duration for BGM in seconds',
      },

      {
        displayName: 'BGM Fade Out (Seconds)',
        name: 'bgmFadeOut',
        type: 'number',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableBGM: [true],
          },
        },
        typeOptions: {
          minValue: 0,
        },
        default: 2,
        description: 'Fade-out duration for BGM in seconds',
      },

      // === NARRATION SECTION ===
      {
        displayName: 'Enable Narration',
        name: 'enableNarration',
        type: 'boolean',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
          },
        },
        default: false,
        description: 'Whether to add narration audio to the video',
      },

      {
        displayName: 'Narration Source',
        name: 'narrationSource',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableNarration: [true],
          },
        },
        options: [
          {
            name: 'URL',
            value: 'url',
          },
          {
            name: 'Binary Data',
            value: 'binary',
          },
        ],
        default: 'url',
        description: 'Source of the narration file',
      },

      {
        displayName: 'Narration URL',
        name: 'narrationUrl',
        type: 'string',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableNarration: [true],
            narrationSource: ['url'],
          },
        },
        default: '',
        placeholder: 'https://example.com/narration.mp3',
        description: 'URL of the narration audio file',
      },

      {
        displayName: 'Narration Binary Property',
        name: 'narrationBinaryProperty',
        type: 'string',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableNarration: [true],
            narrationSource: ['binary'],
          },
        },
        default: 'data',
        placeholder: 'data',
        description: 'Name of the binary property containing the narration',
      },

      {
        displayName: 'Narration Volume',
        name: 'narrationVolume',
        type: 'number',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableNarration: [true],
          },
        },
        typeOptions: {
          minValue: 0,
          maxValue: 100,
        },
        default: 80,
        description: 'Volume of narration (0-100)',
      },

      {
        displayName: 'Narration Delay (Seconds)',
        name: 'narrationDelay',
        type: 'number',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableNarration: [true],
          },
        },
        typeOptions: {
          minValue: 0,
        },
        default: 0,
        description: 'Delay before narration starts in seconds',
      },

      // === SUBTITLE SECTION ===
      {
        displayName: 'Enable Subtitles',
        name: 'enableSubtitles',
        type: 'boolean',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
          },
        },
        default: false,
        description: 'Whether to add subtitles to the video',
      },

      {
        displayName: 'Subtitle Source',
        name: 'subtitleSource',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableSubtitles: [true],
          },
        },
        options: [
          {
            name: 'Manual Input',
            value: 'manual',
          },
          {
            name: 'SRT String',
            value: 'srt_string',
          },
          {
            name: 'SRT File (URL)',
            value: 'srt_url',
          },
          {
            name: 'SRT File (Binary)',
            value: 'srt_binary',
          },
        ],
        default: 'manual',
        description: 'Source of subtitle data',
      },

      {
        displayName: 'SRT Content',
        name: 'srtContent',
        type: 'string',
        typeOptions: {
          rows: 10,
        },
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableSubtitles: [true],
            subtitleSource: ['srt_string'],
          },
        },
        default: '',
        placeholder: '1\n00:00:00,000 --> 00:00:05,000\n첫 번째 자막\n\n2\n00:00:05,000 --> 00:00:10,000\n두 번째 자막\n\n3\n00:00:10,000 --> 00:00:15,000\n세 번째 자막',
        required: true,
        description: 'SRT format subtitle content. Timestamp format: HH:MM:SS,mmm (e.g., 00:00:05,000 for 5 seconds). Short format MM:SS,mmm (e.g., 00:05,000) is also supported and will be converted automatically.',
      },

      {
        displayName: 'Large Text Mode',
        name: 'srtLargeText',
        type: 'boolean',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableSubtitles: [true],
            subtitleSource: ['srt_string'],
          },
        },
        default: false,
        description: 'Whether to use large text mode (120px font, 20% background opacity, black background)',
      },

      {
        displayName: 'Background Color',
        name: 'srtBackgroundColor',
        type: 'color',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableSubtitles: [true],
            subtitleSource: ['srt_string'],
            srtLargeText: [false],
          },
        },
        default: '#000000',
        placeholder: '#000000',
        description: 'Background color in hex format (e.g., #000000 for black). Only used when Large Text Mode is disabled.',
      },

      {
        displayName: 'Background Opacity',
        name: 'srtBackgroundOpacity',
        type: 'number',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableSubtitles: [true],
            subtitleSource: ['srt_string'],
            srtLargeText: [false],
          },
        },
        default: 70,
        typeOptions: {
          minValue: 0,
          maxValue: 100,
        },
        description: 'Background opacity (0-100). 0 = fully transparent, 100 = fully opaque. Only used when Large Text Mode is disabled.',
      },

      {
        displayName: 'SRT File URL',
        name: 'srtFileUrl',
        type: 'string',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableSubtitles: [true],
            subtitleSource: ['srt_url'],
          },
        },
        default: '',
        placeholder: 'https://example.com/subtitles.srt',
        required: true,
        description: 'URL of the SRT subtitle file',
      },

      {
        displayName: 'SRT Binary Property',
        name: 'srtBinaryProperty',
        type: 'string',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableSubtitles: [true],
            subtitleSource: ['srt_binary'],
          },
        },
        default: 'data',
        required: true,
        placeholder: 'data',
        description: 'Name of the binary property containing the SRT file',
      },

      {
        displayName: 'Subtitles',
        name: 'subtitles',
        placeholder: 'Add Subtitle',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: true,
        },
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableSubtitles: [true],
            subtitleSource: ['manual'],
          },
        },
        default: {},
        options: [
          {
            name: 'subtitle',
            displayName: 'Subtitle',
            values: [
											{
												displayName: 'Alignment',
												name: 'alignment',
												type: 'options',
												options: [
													{
														name: 'Left',
														value: 'left',
													},
													{
														name: 'Center',
														value: 'center',
													},
													{
														name: 'Right',
														value: 'right',
													},
												],
												default: 'center',
												description: 'Text alignment',
											},
											{
												displayName: 'Background Color',
												name: 'backgroundColor',
												type: 'color',
												default: '#000000',
												description: 'Background color of the subtitle',
											},
											{
												displayName: 'Background Opacity',
												name: 'backgroundOpacity',
												type: 'number',
												default: 80,
												description: 'Opacity of the background (0-100)',
											},
											{
												displayName: 'Border Color',
												name: 'borderColor',
												type: 'color',
												default: '#000000',
												description: 'Color of the subtitle border',
											},
											{
												displayName: 'Border Width',
												name: 'borderWidth',
												type: 'number',
												default: 2,
												description: 'Width of the subtitle border in pixels',
											},
											{
												displayName: 'Custom X Position',
												name: 'customX',
												type: 'number',
												default: 960,
												description: 'Horizontal position in pixels (for custom position)',
											},
											{
												displayName: 'Custom Y Position',
												name: 'customY',
												type: 'number',
												default: 980,
												description: 'Vertical position in pixels (for custom position)',
											},
											{
												displayName: 'End Time (Seconds)',
												name: 'endTime',
												type: 'number',
												default: 5,
												description: 'When the subtitle disappears',
											},
											{
												displayName: 'Font Color',
												name: 'fontColor',
												type: 'color',
												default: '#FFFFFF',
												description: 'Color of the subtitle text',
											},
											{
												displayName: 'Font Family',
												name: 'fontFamily',
												type: 'string',
												default: 'Arial',
												description: 'Font family for the subtitle',
											},
											{
												displayName: 'Font Size',
												name: 'fontSize',
												type: 'number',
												default: 48,
												description: 'Size of the subtitle text',
											},
											{
												displayName: 'Position',
												name: 'position',
												type: 'options',
												options: [
													{
														name: 'Top',
														value: 'top',
													},
													{
														name: 'Middle',
														value: 'middle',
													},
													{
														name: 'Bottom',
														value: 'bottom',
													},
													{
														name: 'Custom',
														value: 'custom',
													},
													],
												default: 'bottom',
												description: 'Vertical position of the subtitle',
											},
											{
												displayName: 'Start Time (Seconds)',
												name: 'startTime',
												type: 'number',
												default: 0,
												description: 'When the subtitle appears',
											},
											{
												displayName: 'Text',
												name: 'text',
												type: 'string',
												default: '',
												description: 'Subtitle text content',
											},
									],
          },
        ],
      },

      // === OUTPUT SECTION ===
      {
        displayName: 'Output Format',
        name: 'outputFormat',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
          },
        },
        options: [
          {
            name: 'MP4',
            value: 'mp4',
          },
          {
            name: 'MOV',
            value: 'mov',
          },
          {
            name: 'WebM',
            value: 'webm',
          },
        ],
        default: 'mp4',
        description: 'Output video format',
      },

      {
        displayName: 'Video Codec',
        name: 'videoCodec',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
          },
        },
        options: [
          {
            name: 'H.264 (Libx264)',
            value: 'libx264',
          },
          {
            name: 'H.265 (Libx265)',
            value: 'libx265',
          },
          {
            name: 'VP9',
            value: 'vp9',
          },
        ],
        default: 'libx264',
        description: 'Video codec for encoding',
      },

      {
        displayName: 'Quality',
        name: 'quality',
        type: 'options',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
          },
        },
        options: [
          {
            name: 'Low',
            value: 'low',
          },
          {
            name: 'Medium',
            value: 'medium',
          },
          {
            name: 'High',
            value: 'high',
          },
          {
            name: 'Custom',
            value: 'custom',
          },
        ],
        default: 'high',
        description: 'Output quality preset',
      },

      {
        displayName: 'Custom CRF',
        name: 'customCRF',
        type: 'number',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            quality: ['custom'],
          },
        },
        typeOptions: {
          minValue: 0,
          maxValue: 51,
        },
        default: 18,
        description: 'Custom CRF value (0-51, lower is better quality)',
      },

      {
        displayName: 'Half Frame Rate (2x Duration)',
        name: 'halfFrameRate',
        type: 'boolean',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
          },
        },
        default: false,
        description: 'Whether to reduce frame rate by half to double the video duration (displays same frames slower)',
      },

      {
        displayName: 'Sync Video to Audio Duration',
        name: 'syncToAudio',
        type: 'boolean',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
            enableNarration: [true],
          },
        },
        default: false,
        description: 'Whether to stretch/compress video to match narration audio duration (ignores Half Frame Rate)',
      },

      {
        displayName: 'Output Binary Property',
        name: 'outputBinaryProperty',
        type: 'string',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Render'],
          },
        },
        default: 'data',
        description: 'Name of the binary property to store the rendered video',
      },

      // === MERGE OPERATION SECTION ===
      {
        displayName: 'Media Items',
        name: 'mediaItems',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: true,
        },
        displayOptions: {
          show: {
            operation: ['Merge'],
          },
        },
        default: {},
        placeholder: 'Add media item',
        description: 'Videos and images to merge in sequence',
        options: [
          {
            name: 'items',
            displayName: 'Items',
            values: [
              {
                displayName: 'Type',
                name: 'type',
                type: 'options',
                options: [
                  {
                    name: 'Video',
                    value: 'video',
                  },
                  {
                    name: 'Image',
                    value: 'image',
                  },
                ],
                default: 'video',
                description: 'Type of media (video or image)',
              },
              {
                displayName: 'URL',
                name: 'url',
                type: 'string',
                default: '',
                placeholder: 'https://example.com/media.mp4',
                required: true,
                description: 'URL of the video or image',
              },
              {
                displayName: 'Duration (Seconds)',
                name: 'duration',
                type: 'number',
                displayOptions: {
                  show: {
                    type: ['image'],
                  },
                },
                typeOptions: {
                  minValue: 0.1,
                },
                default: 3,
                description: 'Duration in seconds (only for images)',
              },
            ],
          },
        ],
      },

      {
        displayName: 'Audio URL',
        name: 'mergeAudioUrl',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['Merge'],
          },
        },
        default: '',
        placeholder: 'https://example.com/audio.mp3',
        description: 'Optional audio URL. If provided, will automatically calculate image durations to match audio length.',
      },

      {
        displayName: 'Output Filename',
        name: 'outputFilename',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['Merge'],
          },
        },
        default: 'merged-video.mp4',
        placeholder: 'merged-video.mp4',
        description: 'Filename for the merged video output',
      },

      {
        displayName: 'Output Format',
        name: 'mergeOutputFormat',
        type: 'options',
        displayOptions: {
          show: {
            operation: ['Merge'],
          },
        },
        options: [
          {
            name: 'MP4',
            value: 'mp4',
          },
          {
            name: 'MOV',
            value: 'mov',
          },
          {
            name: 'WebM',
            value: 'webm',
          },
        ],
        default: 'mp4',
        description: 'Output video format',
      },

      {
        displayName: 'Video Codec',
        name: 'mergeVideoCodec',
        type: 'options',
        displayOptions: {
          show: {
            operation: ['Merge'],
          },
        },
        options: [
          {
            name: 'H.264 (Libx264)',
            value: 'libx264',
          },
          {
            name: 'H.265 (Libx265)',
            value: 'libx265',
          },
          {
            name: 'VP9',
            value: 'vp9',
          },
        ],
        default: 'libx264',
        description: 'Video codec for encoding',
      },

      {
        displayName: 'Quality',
        name: 'mergeQuality',
        type: 'options',
        displayOptions: {
          show: {
            operation: ['Merge'],
          },
        },
        options: [
          {
            name: 'Low',
            value: 'low',
          },
          {
            name: 'Medium',
            value: 'medium',
          },
          {
            name: 'High',
            value: 'high',
          },
          {
            name: 'Custom',
            value: 'custom',
          },
        ],
        default: 'high',
        description: 'Output quality preset',
      },

      {
        displayName: 'Custom CRF',
        name: 'mergeCustomCRF',
        type: 'number',
        displayOptions: {
          show: {
            resource: ['Video'],
            operation: ['Merge'],
            mergeQuality: ['custom'],
          },
        },
        typeOptions: {
          minValue: 0,
          maxValue: 51,
        },
        default: 18,
        description: 'Custom CRF value (0-51, lower is better quality)',
      },

      {
        displayName: 'Output Binary Property',
        name: 'mergeOutputBinaryProperty',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['Merge'],
          },
        },
        default: 'data',
        description: 'Name of the binary property to store the merged video',
      },

      // === IMAGE TO VIDEO SECTION ===
      {
        displayName: 'Images',
        name: 'images',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: true,
        },
        displayOptions: {
          show: {
            operation: ['ImageToVideo'],
          },
        },
        default: {},
        placeholder: 'Add Image',
        options: [
          {
            name: 'imageValues',
            displayName: 'Image',
            values: [
              {
                displayName: 'Image URL',
                name: 'url',
                type: 'string',
                default: '',
                placeholder: 'https://example.com/image.jpg',
                description: 'URL of the image',
              },
              {
                displayName: 'Duration (Seconds)',
                name: 'duration',
                type: 'number',
                default: 3,
                typeOptions: {
                  minValue: 0.1,
                  maxValue: 60,
                  numberPrecision: 1,
                },
                description: 'How long to display this image in seconds',
              },
            ],
          },
        ],
        description: 'List of images with their display durations',
      },

      {
        displayName: 'Output Filename',
        name: 'imageToVideoOutputFilename',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['ImageToVideo'],
          },
        },
        default: 'images-video.mp4',
        placeholder: 'images-video.mp4',
        description: 'Filename for the output video',
      },

      {
        displayName: 'Output Format',
        name: 'imageToVideoOutputFormat',
        type: 'options',
        displayOptions: {
          show: {
            operation: ['ImageToVideo'],
          },
        },
        options: [
          {
            name: 'MP4',
            value: 'mp4',
          },
          {
            name: 'MOV',
            value: 'mov',
          },
          {
            name: 'WebM',
            value: 'webm',
          },
        ],
        default: 'mp4',
        description: 'Output video format',
      },

      {
        displayName: 'Video Codec',
        name: 'imageToVideoVideoCodec',
        type: 'options',
        displayOptions: {
          show: {
            operation: ['ImageToVideo'],
          },
        },
        options: [
          {
            name: 'H.264 (Libx264)',
            value: 'libx264',
          },
          {
            name: 'H.265 (Libx265)',
            value: 'libx265',
          },
          {
            name: 'VP9',
            value: 'vp9',
          },
        ],
        default: 'libx264',
        description: 'Video codec for encoding',
      },

      {
        displayName: 'Quality',
        name: 'imageToVideoQuality',
        type: 'options',
        displayOptions: {
          show: {
            operation: ['ImageToVideo'],
          },
        },
        options: [
          {
            name: 'Low',
            value: 'low',
            description: 'CRF 28 - Smaller file size',
          },
          {
            name: 'Medium',
            value: 'medium',
            description: 'CRF 23 - Balanced',
          },
          {
            name: 'High',
            value: 'high',
            description: 'CRF 18 - Better quality',
          },
          {
            name: 'Custom',
            value: 'custom',
            description: 'Specify custom CRF value',
          },
        ],
        default: 'high',
        description: 'Video quality setting',
      },

      {
        displayName: 'Custom CRF',
        name: 'imageToVideoCustomCRF',
        type: 'number',
        displayOptions: {
          show: {
            operation: ['ImageToVideo'],
            imageToVideoQuality: ['custom'],
          },
        },
        default: 18,
        typeOptions: {
          minValue: 0,
          maxValue: 51,
        },
        description: 'Custom CRF value (0-51, lower = better quality)',
      },

      {
        displayName: 'Output Binary Property',
        name: 'imageToVideoOutputBinaryProperty',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['ImageToVideo'],
          },
        },
        default: 'data',
        description: 'Name of the binary property to store the output video',
      },

      // === DEBUG OPTIONS ===
      {
        displayName: 'Debug Mode',
        name: 'debugMode',
        type: 'boolean',
        default: false,
        description: 'Whether to enable debug logging to /tmp/sb-render-debug.log',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    console.log(`[SB Render] Execute function called with ${items.length} items`);

    // Get debug mode setting (available across all items)
    const debugMode = this.getNodeParameter('debugMode', 0, false) as boolean;
    if (debugMode) {
      console.log('[SB Render] Debug mode enabled - logging to /tmp/sb-render-debug.log');
    }

    // Set debug mode in VideoComposer via environment variable
    if (debugMode) {
      process.env.SB_RENDER_DEBUG = 'true';
    } else {
      delete process.env.SB_RENDER_DEBUG;
    }

    // Initialize services
    const fileManager = new FileManager();
    const audioMixer = new AudioMixer();
    const subtitleEngine = new SubtitleEngine();
    const videoComposer = new VideoComposer();

    // Helper: Get media file from URL or binary data
    const getMediaFile = async (
      source: 'url' | 'binary',
      url: string | undefined,
      binaryProperty: string | undefined,
      itemIndex: number,
    ): Promise<string> => {
      if (source === 'url' && url) {
        return await fileManager.downloadFile(url);
      }

      if (source === 'binary' && binaryProperty) {
        try {
          const binaryData = this.helpers.assertBinaryData(itemIndex, binaryProperty);
          const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryProperty);
          const getExtension = (mimeType: string): string => {
            const mimeMap: Record<string, string> = {
              'video/mp4': '.mp4',
              'video/quicktime': '.mov',
              'video/webm': '.webm',
              'audio/mpeg': '.mp3',
              'audio/wav': '.wav',
              'audio/aac': '.aac',
            };
            return mimeMap[mimeType] || '';
          };
          const extension = binaryData.fileExtension || getExtension(binaryData.mimeType);
          return await fileManager.extractBinary(buffer, extension);
        } catch (error) {
          // Get available binary properties for better error message
          const item = this.getInputData()[itemIndex];
          const availableProperties = item.binary ? Object.keys(item.binary) : [];
          const errorMsg = availableProperties.length > 0
            ? `Binary property "${binaryProperty}" not found. Available properties: ${availableProperties.join(', ')}. Use the property name, NOT the filename.`
            : `No binary data found in input item ${itemIndex}. Make sure the previous node outputs binary data.`;
          throw new NodeOperationError(this.getNode(), errorMsg, { itemIndex });
        }
      }

      throw new NodeOperationError(this.getNode(), 'Invalid media source configuration', { itemIndex });
    };

    try {
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        try {
          const resource = this.getNodeParameter('resource', itemIndex, 'Video') as string;
          const operation = this.getNodeParameter('operation', itemIndex) as string;

          console.log(`[SB Render] Processing item ${itemIndex}: resource=${resource}, operation=${operation}`);

          if (operation === 'Render') {
            // Get all parameters individually
            const params: ISbRenderNodeParams = {
              resource: 'Video',
              operation: 'Render',
              videoSource: this.getNodeParameter('videoSource', itemIndex) as 'url' | 'binary',
              videoUrl: this.getNodeParameter('videoUrl', itemIndex, '') as string,
              videoBinaryProperty: this.getNodeParameter('videoBinaryProperty', itemIndex, 'data') as string,
              enableBGM: this.getNodeParameter('enableBGM', itemIndex, false) as boolean,
              bgmSource: this.getNodeParameter('bgmSource', itemIndex, 'url') as 'url' | 'binary',
              bgmUrl: this.getNodeParameter('bgmUrl', itemIndex, '') as string,
              bgmBinaryProperty: this.getNodeParameter('bgmBinaryProperty', itemIndex, 'data') as string,
              bgmVolume: this.getNodeParameter('bgmVolume', itemIndex, DEFAULT_VALUES.bgmVolume) as number,
              bgmFadeIn: this.getNodeParameter('bgmFadeIn', itemIndex, DEFAULT_VALUES.bgmFadeIn) as number,
              bgmFadeOut: this.getNodeParameter('bgmFadeOut', itemIndex, DEFAULT_VALUES.bgmFadeOut) as number,
              enableNarration: this.getNodeParameter('enableNarration', itemIndex, false) as boolean,
              narrationSource: this.getNodeParameter('narrationSource', itemIndex, 'url') as 'url' | 'binary',
              narrationUrl: this.getNodeParameter('narrationUrl', itemIndex, '') as string,
              narrationBinaryProperty: this.getNodeParameter('narrationBinaryProperty', itemIndex, 'data') as string,
              narrationVolume: this.getNodeParameter('narrationVolume', itemIndex, DEFAULT_VALUES.narrationVolume) as number,
              narrationDelay: this.getNodeParameter('narrationDelay', itemIndex, DEFAULT_VALUES.narrationDelay) as number,
              enableSubtitles: this.getNodeParameter('enableSubtitles', itemIndex, false) as boolean,
              subtitles: this.getNodeParameter('subtitles', itemIndex, {} as { subtitle?: ISubtitleConfig[] }) as { subtitle?: ISubtitleConfig[] },
              outputFormat: this.getNodeParameter('outputFormat', itemIndex, DEFAULT_VALUES.outputFormat) as 'mp4' | 'mov' | 'webm',
              videoCodec: this.getNodeParameter('videoCodec', itemIndex, DEFAULT_VALUES.videoCodec) as 'libx264' | 'libx265' | 'vp9',
              quality: this.getNodeParameter('quality', itemIndex, DEFAULT_VALUES.quality) as 'low' | 'medium' | 'high' | 'custom',
              customCRF: this.getNodeParameter('customCRF', itemIndex, 18) as number,
              halfFrameRate: this.getNodeParameter('halfFrameRate', itemIndex, false) as boolean,
              syncToAudio: this.getNodeParameter('syncToAudio', itemIndex, false) as boolean,
              outputBinaryProperty: this.getNodeParameter('outputBinaryProperty', itemIndex, DEFAULT_VALUES.outputBinaryProperty) as string,
            };

            // Validate parameters
            try {
              validateParams(params);
            } catch (error) {
              if (error instanceof ValidationError) {
                throw new NodeOperationError(this.getNode(), error.message, { itemIndex });
              }
              throw error;
            }

            // 1. Download/extract video
            console.log(`[SB Render] Input - videoSource: ${params.videoSource}, videoUrl: ${params.videoUrl?.slice(0, 100)}`);
            const videoPath = await getMediaFile(
              params.videoSource || 'url',
              params.videoUrl,
              params.videoBinaryProperty,
              itemIndex,
            );
            console.log(`[SB Render] Downloaded video to: ${videoPath}`);

            // 2. Get video metadata (with fallback if ffprobe unavailable)
            let metadata: IVideoMetadata;
            try {
              metadata = await videoComposer.getVideoMetadata(videoPath);
            } catch (error) {
              // If ffprobe is not available, use safe defaults
              console.warn('Failed to get video metadata, using defaults:', error);
              metadata = {
                duration: 10,
                width: 1920,
                height: 1080,
                hasAudio: false, // Assume no audio to avoid stream errors
                videoCodec: 'unknown',
                audioCodec: undefined,
              };
            }

            // 3. Download/extract BGM and narration if enabled
            let bgmPath: string | null = null;
            let narrationPath: string | null = null;

            if (params.enableBGM && params.bgmSource) {
              bgmPath = await getMediaFile(
                params.bgmSource,
                params.bgmUrl,
                params.bgmBinaryProperty,
                itemIndex,
              );
            }

            if (params.enableNarration && params.narrationSource) {
              narrationPath = await getMediaFile(
                params.narrationSource,
                params.narrationUrl,
                params.narrationBinaryProperty,
                itemIndex,
              );
            }

            // 4. Generate audio filter chain
            let audioFilterChain = '';
            if (params.enableBGM || params.enableNarration) {
              console.log(`[SbRender] Setting up audio mix - BGM: ${!!bgmPath}, Narration: ${!!narrationPath}`);
              
              // Calculate effective duration if syncToAudio is enabled
              let effectiveDuration = metadata.duration;
              if (params.syncToAudio && narrationPath) {
                try {
                  const narrationDuration = await videoComposer.getAudioDuration(narrationPath);
                  console.log(`[SbRender] SyncToAudio enabled. Video: ${metadata.duration}s, Narration: ${narrationDuration}s`);
                  if (narrationDuration > metadata.duration) {
                    effectiveDuration = narrationDuration;
                    console.log(`[SbRender] Extending video duration to match narration: ${effectiveDuration}s`);
                  }
                } catch (error) {
                  console.warn('[SbRender] Failed to get narration duration for sync, using video duration:', error);
                }
              }

              console.log(`[SbRender] Video metadata - Duration: ${metadata.duration}s, Effective Duration: ${effectiveDuration}s, HasAudio: ${metadata.hasAudio}`);
              
              const audioConfig: IAudioMixConfig = {
                videoDuration: effectiveDuration,
                bgmPath: bgmPath || undefined,
                bgmVolume: params.bgmVolume ?? DEFAULT_VALUES.bgmVolume,
                bgmFadeIn: params.bgmFadeIn ?? DEFAULT_VALUES.bgmFadeIn,
                bgmFadeOut: params.bgmFadeOut ?? DEFAULT_VALUES.bgmFadeOut,
                narrationPath: narrationPath || undefined,
                narrationVolume: params.narrationVolume ?? DEFAULT_VALUES.narrationVolume,
                narrationDelay: params.narrationDelay ?? DEFAULT_VALUES.narrationDelay,
              };

              console.log(`[SbRender] Audio config:`, {
                videoDuration: audioConfig.videoDuration,
                hasBGM: !!audioConfig.bgmPath,
                bgmVolume: audioConfig.bgmVolume,
                hasNarration: !!audioConfig.narrationPath,
                narrationVolume: audioConfig.narrationVolume
              });

              audioFilterChain = audioMixer.getAudioFilterChain(audioConfig, metadata.hasAudio);
              console.log(`[SbRender] Generated audio filter chain: ${audioFilterChain}`);
            }

            // 5. Generate subtitles if enabled
            let subtitlePath: string | null = null;
            if (params.enableSubtitles) {
              const subtitleSource = this.getNodeParameter('subtitleSource', itemIndex, 'manual') as 'manual' | 'srt_string' | 'srt_url' | 'srt_binary';
              let subtitleArray: ISubtitleConfig[] = [];

              if (subtitleSource === 'manual') {
                // Use manual subtitle input
                const subtitles = params.subtitles?.subtitle;
                if (subtitles && subtitles.length > 0) {
                  subtitleArray = subtitles;
                }
              } else if (subtitleSource === 'srt_string') {
                // Parse SRT content from string input
                const srtContent = this.getNodeParameter('srtContent', itemIndex) as string;
                const srtLargeText = this.getNodeParameter('srtLargeText', itemIndex, false) as boolean;

                let defaultConfig: Partial<ISubtitleConfig>;
                if (srtLargeText) {
                  // Large text mode: 120px font, 20% opacity, black background
                  defaultConfig = {
                    fontSize: 120,
                    backgroundColor: '#000000',
                    backgroundOpacity: 20,
                  };
                } else {
                  // Custom mode: use user-specified values
                  const backgroundColor = this.getNodeParameter('srtBackgroundColor', itemIndex, '#000000') as string;
                  const backgroundOpacity = this.getNodeParameter('srtBackgroundOpacity', itemIndex, 70) as number;
                  defaultConfig = {
                    backgroundColor,
                    backgroundOpacity,
                  };
                }

                if (srtContent) {
                  subtitleArray = subtitleEngine.parseSRT(srtContent, defaultConfig);
                }
              } else if (subtitleSource === 'srt_url') {
                // Download SRT file from URL
                const srtFileUrl = this.getNodeParameter('srtFileUrl', itemIndex) as string;
                if (srtFileUrl) {
                  const srtFilePath = await fileManager.downloadFile(srtFileUrl);
                  const srtContent = await fileManager.readFileAsText(srtFilePath);
                  subtitleArray = subtitleEngine.parseSRT(srtContent);
                }
              } else if (subtitleSource === 'srt_binary') {
                // Extract SRT file from binary data
                const srtBinaryProperty = this.getNodeParameter('srtBinaryProperty', itemIndex, 'data') as string;
                try {
                  this.helpers.assertBinaryData(itemIndex, srtBinaryProperty);
                  const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, srtBinaryProperty);
                  const srtContent = buffer.toString('utf-8');
                  subtitleArray = subtitleEngine.parseSRT(srtContent);
                } catch (error) {
                  const item = this.getInputData()[itemIndex];
                  const availableProperties = item.binary ? Object.keys(item.binary) : [];
                  const errorMsg = availableProperties.length > 0
                    ? `Binary property "${srtBinaryProperty}" not found. Available properties: ${availableProperties.join(', ')}`
                    : `No binary data found in input item ${itemIndex}`;
                  throw new NodeOperationError(this.getNode(), errorMsg, { itemIndex });
                }
              }

              // Generate ASS file from subtitle array
              if (subtitleArray.length > 0) {
                const assContent = subtitleEngine.generateASS(
                  subtitleArray,
                  metadata.width,
                  metadata.height,
                );
                subtitlePath = await subtitleEngine.writeSubtitleFile(assContent, 'ass');
              }
            }

            // 6. Compose final video
            const outputPath = await fileManager.createTempFile(`.${params.outputFormat}`);

            const videoBuffer = await videoComposer.composeWithAudioMix(
              videoPath,
              bgmPath,
              narrationPath,
              subtitlePath,
              audioFilterChain,
              outputPath,
              params,
            );

            // 7. Return result with binary data
            const binaryPropertyName = params.outputBinaryProperty || 'data';

            // Extract filename from video URL
            let filename = `rendered.${params.outputFormat}`;
            if (params.videoSource === 'url' && params.videoUrl) {
              try {
                const urlPath = new URL(params.videoUrl).pathname;
                const originalFilename = urlPath.split('/').pop() || '';
                if (originalFilename) {
                  // Remove extension and add output format
                  const nameWithoutExt = originalFilename.replace(/\.[^.]+$/, '');
                  filename = `${nameWithoutExt}.${params.outputFormat}`;
                }
              } catch (error) {
                // If URL parsing fails, use default filename
                console.warn('Failed to extract filename from URL, using default:', error);
              }
            }

            const result: INodeExecutionData = {
              json: {
                success: true,
                duration: metadata.duration,
                width: metadata.width,
                height: metadata.height,
              },
              binary: {
                [binaryPropertyName]: await this.helpers.prepareBinaryData(
                  videoBuffer,
                  filename,
                  `video/${params.outputFormat}`,
                ),
              },
              pairedItem: itemIndex,
            };

            returnData.push(result);
          } else if (operation === 'Merge') {
            // Get merge parameters (support both old videoUrls and new mediaItems format)
            const mediaItemsParam = this.getNodeParameter('mediaItems', itemIndex, {}) as { items?: Array<{ type: 'video' | 'image'; url: string; duration?: number }> };
            let mediaItems = mediaItemsParam.items || [];

            // Backward compatibility: check for old videoUrls parameter
            if (mediaItems.length === 0) {
              try {
                const videoUrls = this.getNodeParameter('videoUrls', itemIndex, []) as string[];
                if (videoUrls && videoUrls.length > 0) {
                  console.log('[SB Render] Using legacy videoUrls parameter');
                  mediaItems = videoUrls.map(url => ({ type: 'video' as const, url }));
                }
              } catch (error) {
                // videoUrls parameter doesn't exist, that's fine
              }
            }

            const outputFilename = this.getNodeParameter('outputFilename', itemIndex, 'merged-video.mp4') as string;
            const mergeOutputFormat = this.getNodeParameter('mergeOutputFormat', itemIndex, 'mp4') as 'mp4' | 'mov' | 'webm';
            const mergeVideoCodec = this.getNodeParameter('mergeVideoCodec', itemIndex, 'libx264') as 'libx264' | 'libx265' | 'vp9';
            const mergeQuality = this.getNodeParameter('mergeQuality', itemIndex, 'high') as 'low' | 'medium' | 'high' | 'custom';
            const mergeCustomCRF = this.getNodeParameter('mergeCustomCRF', itemIndex, 18) as number;
            const mergeOutputBinaryProperty = this.getNodeParameter('mergeOutputBinaryProperty', itemIndex, 'data') as string;

            console.log(`[SB Render] Merge operation starting with ${mediaItems.length} items`);

            // Check if BGM should be added to merged video
            const enableMergeBGM = this.getNodeParameter('enableBGM', itemIndex, false) as boolean;
            let mergeBgmPath: string | null = null;

            if (enableMergeBGM) {
              console.log('[SB Render] BGM will be added to merged video');
              const bgmSource = this.getNodeParameter('bgmSource', itemIndex, 'url') as 'url' | 'binary';
              mergeBgmPath = await getMediaFile(
                bgmSource,
                this.getNodeParameter('bgmUrl', itemIndex, '') as string,
                this.getNodeParameter('bgmBinaryProperty', itemIndex, 'data') as string,
                itemIndex,
              );
            }

            if (!mediaItems || mediaItems.length === 0) {
              throw new NodeOperationError(this.getNode(), 'No media items provided for merging', { itemIndex });
            }

            // Process all media items (videos and images)
            console.log('[SB Render] Processing media items...');
            const videoPaths: string[] = [];

            for (let i = 0; i < mediaItems.length; i++) {
              const item = mediaItems[i];
              console.log(`[SB Render] Processing item ${i + 1}/${mediaItems.length}: type=${item.type}, url=${item.url}`);

              if (item.type === 'video') {
                // Download video
                const videoPath = await fileManager.downloadFile(item.url);
                videoPaths.push(videoPath);
                console.log(`[SB Render] Downloaded video to: ${videoPath}`);
              } else if (item.type === 'image') {
                // Download image and convert to video
                const imagePath = await fileManager.downloadFile(item.url);
                console.log(`[SB Render] Downloaded image to: ${imagePath}, duration: ${item.duration || 3}s`);

                // Create temporary video from image
                const tempVideoPath = await fileManager.createTempFile('.mp4');
                await videoComposer.createVideoFromImages(
                  [imagePath],
                  [item.duration || 3],
                  tempVideoPath,
                  mergeVideoCodec,
                  mergeQuality,
                  mergeCustomCRF,
                  'mp4',
                );

                videoPaths.push(tempVideoPath);
                console.log(`[SB Render] Converted image to video: ${tempVideoPath}`);
              }
            }

            // Create output path
            const outputPath = await fileManager.createTempFile(`.${mergeOutputFormat}`);
            console.log(`[SB Render] Output path: ${outputPath}`);

            // Merge all videos
            console.log('[SB Render] Starting merge...');
            let videoBuffer: Buffer;
            
            if (mergeBgmPath) {
              // Merge videos first, then add BGM in a separate step
              const tempMergedPath = await fileManager.createTempFile('.mp4');
              await videoComposer.mergeVideos(
                videoPaths,
                tempMergedPath,
                mergeVideoCodec,
                mergeQuality,
                mergeCustomCRF,
                'mp4', // Use mp4 for intermediate file
              );
              
              // Get metadata of merged video for BGM processing
              let mergedMetadata: IVideoMetadata;
              try {
                mergedMetadata = await videoComposer.getVideoMetadata(tempMergedPath);
                console.log(`[SB Render] Merged video metadata: duration=${mergedMetadata.duration}s, hasAudio=${mergedMetadata.hasAudio}`);
              } catch (error) {
                console.warn('[SB Render] Failed to get merged video metadata, estimating duration');
                // Estimate duration based on input videos/images
                let estimatedDuration = 0;
                for (const item of mediaItems) {
                  if (item.type === 'image') {
                    estimatedDuration += item.duration || 3;
                  } else {
                    estimatedDuration += 10; // Estimate 10s per video
                  }
                }
                mergedMetadata = {
                  duration: estimatedDuration,
                  width: 1920,
                  height: 1080,
                  hasAudio: true,
                  videoCodec: 'unknown'
                };
              }
              
              // Add BGM to merged video
              const audioConfig: IAudioMixConfig = {
                videoDuration: mergedMetadata.duration,
                bgmPath: mergeBgmPath,
                bgmVolume: this.getNodeParameter('bgmVolume', itemIndex, 30) as number,
                bgmFadeIn: this.getNodeParameter('bgmFadeIn', itemIndex, 2) as number,
                bgmFadeOut: this.getNodeParameter('bgmFadeOut', itemIndex, 2) as number,
                narrationVolume: 100, // Default value
                narrationDelay: 0, // Default value
              };
              
              const audioFilterChain = audioMixer.getAudioFilterChain(audioConfig, mergedMetadata.hasAudio);
              console.log(`[SB Render] Adding BGM to merged video with filter: ${audioFilterChain}`);
              
              const outputPath = await fileManager.createTempFile(`.${mergeOutputFormat}`);
              videoBuffer = await videoComposer.composeWithAudioMix(
                tempMergedPath,
                mergeBgmPath,
                null, // No narration
                null, // No subtitles
                audioFilterChain,
                outputPath,
                {
                  videoCodec: mergeVideoCodec,
                  quality: mergeQuality,
                  customCRF: mergeCustomCRF,
                  outputFormat: mergeOutputFormat,
                } as ISbRenderNodeParams,
              );
            } else {
              // Just merge videos without BGM
              const outputPath = await fileManager.createTempFile(`.${mergeOutputFormat}`);
              videoBuffer = await videoComposer.mergeVideos(
                videoPaths,
                outputPath,
                mergeVideoCodec,
                mergeQuality,
                mergeCustomCRF,
                mergeOutputFormat,
              );
            }
            
            console.log(`[SB Render] Merge completed, buffer size: ${videoBuffer.length} bytes`);

            // Return result with binary data
            const result: INodeExecutionData = {
              json: {
                success: true,
                itemCount: mediaItems.length,
                outputSize: videoBuffer.length,
                outputFilename: outputFilename,
              },
              binary: {
                [mergeOutputBinaryProperty]: await this.helpers.prepareBinaryData(
                  videoBuffer,
                  outputFilename,
                  `video/${mergeOutputFormat}`,
                ),
              },
              pairedItem: itemIndex,
            };

            console.log('[SB Render] Pushing result to returnData');
            returnData.push(result);
            console.log(`[SB Render] ReturnData length: ${returnData.length}`);
          } else if (operation === 'ImageToVideo') {
            // Get ImageToVideo parameters
            const imagesParam = this.getNodeParameter('images', itemIndex, {}) as { imageValues?: Array<{ url: string; duration: number }> };
            const imageValues = imagesParam.imageValues || [];
            const outputFilename = this.getNodeParameter('imageToVideoOutputFilename', itemIndex, 'images-video.mp4') as string;
            const imageToVideoOutputFormat = this.getNodeParameter('imageToVideoOutputFormat', itemIndex, 'mp4') as 'mp4' | 'mov' | 'webm';
            const imageToVideoVideoCodec = this.getNodeParameter('imageToVideoVideoCodec', itemIndex, 'libx264') as 'libx264' | 'libx265' | 'vp9';
            const imageToVideoQuality = this.getNodeParameter('imageToVideoQuality', itemIndex, 'high') as 'low' | 'medium' | 'high' | 'custom';
            const imageToVideoCustomCRF = this.getNodeParameter('imageToVideoCustomCRF', itemIndex, 18) as number;
            const imageToVideoOutputBinaryProperty = this.getNodeParameter('imageToVideoOutputBinaryProperty', itemIndex, 'data') as string;

            console.log(`[SB Render] ImageToVideo operation starting with ${imageValues.length} images`);

            if (!imageValues || imageValues.length === 0) {
              throw new NodeOperationError(this.getNode(), 'No images provided for ImageToVideo operation', { itemIndex });
            }

            // Download all images
            console.log('[SB Render] Downloading images...');
            const imagePaths: string[] = [];
            const durations: number[] = [];

            for (let i = 0; i < imageValues.length; i++) {
              const imageValue = imageValues[i];
              console.log(`[SB Render] Downloading image ${i + 1}/${imageValues.length}: ${imageValue.url}`);
              const imagePath = await fileManager.downloadFile(imageValue.url);
              imagePaths.push(imagePath);
              durations.push(imageValue.duration);
              console.log(`[SB Render] Downloaded to: ${imagePath}, duration: ${imageValue.duration}s`);
            }

            // Create output path
            const outputPath = await fileManager.createTempFile(`.${imageToVideoOutputFormat}`);
            console.log(`[SB Render] Output path: ${outputPath}`);

            // Create video from images
            console.log('[SB Render] Creating video from images...');
            const videoBuffer = await videoComposer.createVideoFromImages(
              imagePaths,
              durations,
              outputPath,
              imageToVideoVideoCodec,
              imageToVideoQuality,
              imageToVideoCustomCRF,
              imageToVideoOutputFormat,
            );
            console.log(`[SB Render] Video creation completed, buffer size: ${videoBuffer.length} bytes`);

            // Return result with binary data
            const result: INodeExecutionData = {
              json: {
                success: true,
                imageCount: imageValues.length,
                totalDuration: durations.reduce((sum, d) => sum + d, 0),
                outputSize: videoBuffer.length,
                outputFilename: outputFilename,
              },
              binary: {
                [imageToVideoOutputBinaryProperty]: await this.helpers.prepareBinaryData(
                  videoBuffer,
                  outputFilename,
                  `video/${imageToVideoOutputFormat}`,
                ),
              },
              pairedItem: itemIndex,
            };

            console.log('[SB Render] Pushing result to returnData');
            returnData.push(result);
            console.log(`[SB Render] ReturnData length: ${returnData.length}`);
          } else {
            console.log(`[SB Render] Unknown operation: ${operation}`);
            throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex });
          }
        } catch (error) {
          if (this.continueOnFail()) {
            returnData.push({
              json: {
                error: error instanceof Error ? error.message : String(error),
              },
              pairedItem: itemIndex,
            });
            continue;
          }
          throw error;
        }
      }

      return [returnData];
    } finally {
      // Cleanup temporary files
      await fileManager.cleanup();
    }
  }
}
