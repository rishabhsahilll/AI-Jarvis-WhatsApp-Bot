AI Jarvis WhatsApp Bot - Your Cross-Platform Chat Buddy!

AI Jarvis Bot Badge: Green WhatsApp Bot Label
A smart WhatsApp bot by Rishabh Sahil - Runs on mobile & laptop with AI-powered fun!

What is AI Jarvis?

Welcome to AI Jarvis, a versatile WhatsApp bot crafted by Rishabh Sahil, a full-stack developer with 3 years of experience. This bot brings AI-powered chatting, image analysis, music recommendations, and more to your WhatsApp—whether you’re on a phone (via Termux) or a laptop! Hosted at https://github.com/rishabhsahilll/AI-Jarvis-WhatsApp-Bot, it’s free and open for everyone to use and enhance!

- Mobile-Friendly: Runs in the background on Android with Termux.
- Laptop-Ready: Includes system control features like screenshots and volume adjustments.
- Easy Setup: Use setup.bat on Windows or manual steps for mobile.

Features

For Everyone (Mobile & Laptop)
Rolling Hinglish Chats: Chat with Jarvis like a dost with emojis! (e.g., "Kya haal hai?")
- Image Analysis: Send pics with /analyze or /image <query> for fun descriptions.
- Music Recommendations: Say "Gana bajao" for song links from YouTube.
- Real-Time Info: Ask "Holi kab hai?" for live updates.
- Thought Updates: Set cool statuses with @7250 thought <options>.
- Feedback: Share thoughts with @7250 feedback <text>.

Laptop-Only Features
- System Info: Check CPU, RAM, and battery with @7250 system info.
- Voice Output: Make Jarvis speak with @7250 speak: <text>.
- Volume Control: Adjust sound with @7250 volume up <percent>.
- Screenshots: Capture screen with @7250 ss.
- Commands: Run system commands with @7250 cmd <command>.
- Shortcuts: Trigger keys with @7250 key: <shortcut>.

Note: Laptop-only features show "Sorry dost, ye phone pe nahi chalega!" on mobile.

Setup on Mobile (Android + Termux)

1. Install Termux: Get it from https://f-droid.org/packages/com.termux/.
2. Install Prerequisites:
   pkg install nodejs git -y
3. Clone the Repo:
   git clone https://github.com/rishabhsahilll/AI-Jarvis-WhatsApp-Bot.git
   cd AI-Jarvis-WhatsApp-Bot
4. Install Dependencies:
   npm install
5. Configure: Create a .env file (see below) with your API keys.
6. Run in Background:
   node whatsappBot.js & disown
7. Stop It:
   pkill -f "node whatsappBot.js"
8. Update:
   git pull origin main
   npm install
   node whatsappBot.js & disown

Scan the QR code in Termux with WhatsApp to link it!

Setup on Laptop (Windows)

1. Prerequisites: Install Git (https://git-scm.com/downloads) and Node.js (https://nodejs.org/).
2. Run Setup Script:
   - Download or clone the repo:
     git clone https://github.com/rishabhsahilll/AI-Jarvis-WhatsApp-Bot.git
   - Open CMD in the repo folder:
     cd AI-Jarvis-WhatsApp-Bot
   - Run:
     setup.bat
   - Follow prompts to enter API keys.
3. Manual Alternative:
   - Clone the repo:
     git clone https://github.com/rishabhsahilll/AI-Jarvis-WhatsApp-Bot.git
     cd AI-Jarvis-WhatsApp-Bot
   - Install dependencies:
     npm install
   - Create .env (see below).
4. Run the Bot:
   node whatsappBot.js
5. Background Running (Optional):
   npm install -g pm2
   pm2 start whatsappBot.js
   pm2 save
   pm2 startup

Configure Your .env

Create a .env file in AI-Jarvis-WhatsApp-Bot with:
GeminiAPIKey=YOUR_GEMINI_API_KEY
GroqAPIKey1=YOUR_GROQ_API_KEY_1
GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY
GOOGLE_CX=YOUR_GOOGLE_CX
Developername=Rishabh           # Your name or alias
Assistantname=Jarvis            # Customize if you like

Get your keys from:
- Google Gemini: https://ai.google.dev/
- Groq: https://groq.com/
- Google Custom Search: https://developers.google.com/custom-search

The setup.bat script automates this on Windows!

How to Use

- Start: Send . or hello
- Stop: Send bye
- Commands: Use @7250 <command> (e.g., @7250 help)
- Full Help: Type help for all options

The Developer

Rishabh Sahil is the mastermind behind AI Jarvis! With 3 years of full-stack development experience, he’s built a bot that’s both fun and functional. Connect with him:
- Instagram: https://instagram.com/rishabhsahill
- GitHub: https://github.com/rishabhsahilll
- Portfolio: https://portfolio-flask-application.vercel.app
- R.S.E: https://rishabhsahilll.github.io/rishabh-search-engine/
- Anti-Social Media: https://netrarsy.pythonanywhere.com

Contribute

Want to make Jarvis even better? Fork it, tweak it, and send a pull request!
1. Fork the repo
2. Create a branch:
   git checkout -b my-cool-feature
3. Commit changes:
   git commit -am 'Added something awesome'
4. Push:
   git push origin my-cool-feature
5. Open a Pull Request

License

MIT License - Free to use, modify, and share!

Star this repo at https://github.com/rishabhsahilll/AI-Jarvis-WhatsApp-Bot if you love it!
Enjoy chatting with Jarvis!
