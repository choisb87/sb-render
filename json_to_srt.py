#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json
import datetime

# The JSON data provided by the user
json_data_string = """
[
  {
    "audio": {
      "url": "https://v3b.fal.media/files/b/elephant/GvNAgLjghPd_1PRrTP5I7_output.mp3",
      "content_type": "audio/mpeg",
      "file_name": "output.mp3",
      "file_size": 69008
    },
    "timestamps": [
      {
        "characters": [
          " ", "a", "n", "n", "y", "e", "o", "n", "g", "h", "a", "s", "e", "y", "o", " ", "c", "o", "e", "s", "e", "u", "n", "g", "b", "o", "n", "g", "i", "b", "n", "i", "d", "a", ".", " ", "y", "o", "j", "e", "u", "m", " ", "m", "a", "n", "h", "i", " ", "c", "u", "b", "j", "y", "o", "?", " "
        ],
        "character_start_times_seconds": [
          0, 0.07, 0.116, 0.151, 0.186, 0.221, 0.244, 0.267, 0.29, 0.313, 0.348, 0.383, 0.441, 0.488, 0.557, 0.708, 0.952, 0.998, 1.057, 1.126, 1.173, 1.207, 1.231, 1.254, 1.289, 1.335, 1.382, 1.405, 1.451, 1.498, 1.544, 1.579, 1.625, 1.683, 1.858, 1.974, 2.786, 2.856, 2.937, 2.984, 3.019, 3.053, 3.111, 3.228, 3.297, 3.355, 3.402, 3.448, 3.471, 3.518, 3.541, 3.622, 3.68, 3.738, 3.796, 3.913, 4.029
        ],
        "character_end_times_seconds": [
          0.07, 0.116, 0.151, 0.186, 0.221, 0.244, 0.267, 0.29, 0.313, 0.348, 0.383, 0.441, 0.488, 0.557, 0.708, 0.952, 0.998, 1.057, 1.126, 1.173, 1.207, 1.231, 1.254, 1.289, 1.335, 1.382, 1.405, 1.451, 1.498, 1.544, 1.579, 1.625, 1.683, 1.858, 1.974, 2.786, 2.856, 2.937, 2.984, 3.019, 3.053, 3.111, 3.228, 3.297, 3.355, 3.402, 3.448, 3.471, 3.518, 3.541, 3.622, 3.68, 3.738, 3.796, 3.913, 4.029, 4.272
        ]
      }
    ]
  }
]
"""

def format_time(seconds: float) -> str:
    """Converts seconds to SRT time format HH:MM:SS,ms."""
    delta = datetime.timedelta(seconds=seconds)
    micros = delta.microseconds
    # timedelta.seconds is only the seconds part of the duration
    total_seconds = int(delta.total_seconds())
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    milliseconds = micros // 1000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"

def create_srt_from_json(data: list) -> str:
    """Generates SRT content from the given JSON data structure."""
    srt_blocks = []
    subtitle_index = 1
    
    if not data or 'timestamps' not in data[0] or not data[0]['timestamps']:
        return ""

    timestamps_data = data[0]['timestamps'][0]
    characters = timestamps_data['characters']
    start_times = timestamps_data['character_start_times_seconds']
    end_times = timestamps_data['character_end_times_seconds']

    current_line = ""
    line_start_time = None
    
    for i, char in enumerate(characters):
        # Set start time at the first non-whitespace character
        if line_start_time is None and not char.isspace():
            line_start_time = start_times[i]

        if char in ".?!\":
            current_line += char
            line_end_time = end_times[i]
            
            if current_line.strip() and line_start_time is not None:
                srt_blocks.append(str(subtitle_index))
                srt_blocks.append(f"{format_time(line_start_time)} --> {format_time(line_end_time)}")
                srt_blocks.append(current_line.strip())
                srt_blocks.append("")
                
                subtitle_index += 1
            
            # Reset for the next line
            current_line = ""
            line_start_time = None
        else:
            current_line += char

    # Handle any remaining text that doesn't end with punctuation
    if current_line.strip() and line_start_time is not None:
        # Find the end time of the last non-whitespace character
        last_char_index = -1
        for i in range(len(characters) - 1, -1, -1):
            if not characters[i].isspace():
                last_char_index = i
                break
        
        if last_char_index != -1:
            line_end_time = end_times[last_char_index]
            srt_blocks.append(str(subtitle_index))
            srt_blocks.append(f"{format_time(line_start_time)} --> {format_time(line_end_time)}")
            srt_blocks.append(current_line.strip())
            srt_blocks.append("")

    return "\n".join(srt_blocks)

def main():
    """Main function to generate and write the SRT file."""
    try:
        # Load the JSON data from the string
        data = json.loads(json_data_string)

        # Generate the SRT content
        srt_output = create_srt_from_json(data)

        # Define the output filename
        output_filename = "output.srt"

        # Write the SRT content to a file
        with open(output_filename, "w", encoding="utf-8") as f:
            f.write(srt_output)

        print(f"'{output_filename}' 파일이 성공적으로 생성되었습니다.")

    except json.JSONDecodeError:
        print("오류: 제공된 JSON 데이터 형식이 올바르지 않습니다.")
    except Exception as e:
        print(f"오류가 발생했습니다: {e}")

if __name__ == "__main__":
    main()
