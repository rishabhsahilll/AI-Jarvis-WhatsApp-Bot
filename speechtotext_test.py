from pydub import AudioSegment
print("Testing ffmpeg with pydub...")
audio = AudioSegment.from_ogg("test.ogg")  # Replace with a sample .ogg file
audio.export("test.wav", format="wav")
print("Conversion successful!")