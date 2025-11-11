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
        description: 'Name of the binary property containing the video',
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
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

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
      }

      throw new NodeOperationError(this.getNode(), 'Invalid media source configuration', { itemIndex });
    };

    try {
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        try {
          const resource = this.getNodeParameter('resource', itemIndex) as string;
          const operation = this.getNodeParameter('operation', itemIndex) as string;

          if (resource === 'Video' && operation === 'Render') {
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
            const videoPath = await getMediaFile(
              params.videoSource,
              params.videoUrl,
              params.videoBinaryProperty,
              itemIndex,
            );

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
              const audioConfig: IAudioMixConfig = {
                videoDuration: metadata.duration,
                bgmPath: bgmPath || undefined,
                bgmVolume: params.bgmVolume ?? DEFAULT_VALUES.bgmVolume,
                bgmFadeIn: params.bgmFadeIn ?? DEFAULT_VALUES.bgmFadeIn,
                bgmFadeOut: params.bgmFadeOut ?? DEFAULT_VALUES.bgmFadeOut,
                narrationPath: narrationPath || undefined,
                narrationVolume: params.narrationVolume ?? DEFAULT_VALUES.narrationVolume,
                narrationDelay: params.narrationDelay ?? DEFAULT_VALUES.narrationDelay,
              };

              audioFilterChain = audioMixer.getAudioFilterChain(audioConfig, metadata.hasAudio);
            }

            // 5. Generate subtitles if enabled
            let subtitlePath: string | null = null;
            if (params.enableSubtitles && params.subtitles?.subtitle) {
              const subtitleArray = params.subtitles.subtitle;
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
                  `rendered.${params.outputFormat}`,
                  `video/${params.outputFormat}`,
                ),
              },
              pairedItem: itemIndex,
            };

            returnData.push(result);
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
