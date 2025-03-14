@echo off
ECHO Setting up AI Jarvis WhatsApp Bot...

:: Check if git is installed
ECHO Checking for Git...
git --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    ECHO Git is not installed! Please install Git from https://git-scm.com/downloads and rerun this script.
    pause
    exit /b 1
)

:: Check if Node.js is installed
ECHO Checking for Node.js...
node -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    ECHO Node.js is not installed! Please install Node.js from https://nodejs.org/ and rerun this script.
    pause
    exit /b 1
)

:: Clone the repository
ECHO Cloning the AI Jarvis repository...
IF EXIST AI-JARVIS-RSY (
    ECHO Repository already exists. Pulling latest changes...
    cd AI-JARVIS-RSY
    git pull origin main
    cd ..
) ELSE (
    git clone https://github.com/rishabhsahilll/AI-JARVIS-RSY.git
)

cd AI-JARVIS-RSY

:: Install dependencies
ECHO Installing Node.js dependencies...
npm install

:: Create .env file with user input
ECHO Setting up environment variables...
set /p GEMINI_API="Enter your Gemini API Key (get from https://ai.google.dev/): "
set /p GROQ_API1="Enter your Groq API Key 1 (get from https://groq.com/): "
set /p GOOGLE_API="Enter your Google API Key (get from https://developers.google.com/custom-search): "
set /p GOOGLE_CX="Enter your Google CX (get from https://developers.google.com/custom-search): "
set /p DEV_NAME="Enter your Developer Name (e.g., Rishabh): "

ECHO Creating .env file...
(
    ECHO GeminiAPIKey=%GEMINI_API%
    ECHO GroqAPIKey1=%GROQ_API1%
    ECHO GOOGLE_API_KEY=%GOOGLE_API%
    ECHO GOOGLE_CX=%GOOGLE_CX%
    ECHO Developername=%DEV_NAME%
    ECHO Assistantname=Jarvis
) > .env

:: Final instructions
ECHO Setup complete!
ECHO To run the bot:
ECHO 1. cd AI-JARVIS-RSY
ECHO 2. node whatsappBot.js
ECHO For background running (optional):
ECHO    npm install -g pm2
ECHO    pm2 start whatsappBot.js
ECHO.
ECHO For mobile (Termux) setup, see README.txt for additional steps.
ECHO Scan the QR code with WhatsApp to link the bot!

pause
