import os
import sys
from pydub import AudioSegment
from groq import Groq
from dotenv import load_dotenv

# Set UTF-8 encoding for console output
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')  # For error messages too

# Load environment variables from .env file
load_dotenv()

def convert_ogg_to_wav(ogg_path, wav_path):
    try:
        # Load OGG file and convert to WAV with Grok-compatible format: mono, 16kHz
        audio = AudioSegment.from_ogg(ogg_path)
        audio = audio.set_channels(1)  # Mono
        audio = audio.set_frame_rate(16000)  # 16kHz
        audio = audio.set_sample_width(2)  # 16-bit
        audio.export(wav_path, format="wav")
    except Exception as e:
        print(f"Audio conversion failed: {str(e)}")
        raise

def transcribe_audio(file_path):
    # Ensure file exists and is OGG
    if not os.path.exists(file_path) or not file_path.endswith('.ogg'):
        print(f"Valid OGG file chahiye, bhai! Given: {file_path}")
        sys.exit(1)

    # Convert OGG to WAV
    wav_path = file_path.replace('.ogg', '.wav')
    try:
        convert_ogg_to_wav(file_path, wav_path)

        # Get API key from .env
        api_key = os.getenv("GroqAPIKey")
        if not api_key:
            print("API key nahi mila, bhai! .env file check kar.")
            sys.exit(1)

        # Initialize Groq client with API key from .env
        client = Groq(api_key=api_key)

        # Open the WAV file and transcribe using Groq API
        with open(wav_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                file=audio_file,
                model="whisper-large-v3-turbo",
                response_format="text",
                language="hi",
                prompt="Transcribe Hinglish audio with Hindi and English words like 'hme', 'batao', 'bro ai', 'question'"
            )
            # Handle potential Unicode characters
            if isinstance(transcription, str):
                print(f"Transcription: {transcription}")
            else:
                print(f"Transcription: {transcription.decode('utf-8', errors='replace')}")

    except Exception as e:
        print(f"Error ho gaya, bhai: {str(e)}")
    finally:
        # Clean up WAV file
        for path in [wav_path, file_path]:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception as e:
                    print(f"File delete nahi hua: {path}, Error: {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("File path do, bhai! Usage: python script.py audio.ogg")
        sys.exit(1)
    
    file_path = sys.argv[1]
    transcribe_audio(file_path)