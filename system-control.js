const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const screenshot = require('screenshot-desktop');
const gTTS = require('gtts');
const { play } = require('sound-play');

class SystemControl {
    constructor(client, ownerNumber) {
        this.client = client;
        this.ownerNumber = ownerNumber;
        this.batteryThresholds = { low: 10, critical: 5 };
        this.checkBatteryInterval = null;
    }

    async getBatteryStatus() {
        try {
            if (process.platform === 'win32') {
                const output = execSync('powercfg /batteryreport /output battery.html /duration 1', { encoding: 'utf8', stdio: 'pipe' });
                const html = await fs.readFile('battery.html', 'utf8');
                const match = html.match(/(\d+)%/);
                const percentage = match ? parseInt(match[1]) : null;
                await fs.unlink('battery.html');
                return percentage;
            } else if (process.platform === 'linux') {
                const output = execSync('upower -i /org/freedesktop/UPower/devices/battery_BAT0 | grep percentage', { encoding: 'utf8' });
                const match = output.match(/(\d+)%/);
                return match ? parseInt(match[1]) : null;
            }
            return null;
        } catch (e) {
            console.error(`Battery status error: ${e.message}`);
            return null;
        }
    }

    async speak(text) {
        try {
            const gtts = new gTTS(text, 'hi');
            const tempFile = path.join(__dirname, 'temp_speech.mp3');
            await new Promise((resolve, reject) => {
                gtts.save(tempFile, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            await play(tempFile);
            await fs.unlink(tempFile);
        } catch (e) {
            console.error(`Speak error: ${e.message}`);
        }
    }

    adjustVolume(percentage) {
        try {
            if (process.platform === 'win32') {
                // Silent execution with shell bypass
                execSync(`nircmd.exe setsysvolume ${Math.floor((percentage / 100) * 65535)}`, {
                    stdio: 'ignore', // Suppress output to avoid prompts
                    shell: true // Use shell to avoid UAC in some cases
                });
            }
        } catch (e) {
            console.error(`Volume adjustment error: ${e.message}`);
        }
    }

    getCurrentVolume() {
        try {
            if (process.platform === 'win32') {
                const output = execSync('nircmd.exe showsysvolume', {
                    encoding: 'utf8',
                    stdio: 'pipe' // Pipe output instead of inherit to avoid prompts
                });
                const volume = parseInt(output.match(/(\d+)/)?.[0] || 0);
                return Math.round((volume / 65535) * 100);
            }
            return 'Unknown';
        } catch (e) {
            console.error(`Get volume error: ${e.message}`);
            return 'Unknown';
        }
    }

    executeCommand(command) {
        try {
            const output = execSync(command, { encoding: 'utf8' });
            return output.slice(0, 1000);
        } catch (e) {
            return `Error: ${e.message}`;
        }
    }

    async takeScreenshot() {
        const ssDir = path.join(__dirname, 'data/bot/system');
        await fs.mkdir(ssDir, { recursive: true });
        const ssPath = path.join(ssDir, `screenshot_${Date.now()}.png`);
        await screenshot({ filename: ssPath });
        return ssPath;
    }

    executeShortcut(shortcut) {
        try {
            const keys = shortcut.toLowerCase().split('+');
            let psCommand = '';
            const keyMap = {
                'ctrl': 'Control',
                'alt': 'Alt',
                'shift': 'Shift',
                'tab': '{TAB}',
                'enter': '{ENTER}',
                'backspace': '{BACKSPACE}',
                'delete': '{DELETE}',
                'esc': '{ESC}',
                'win': 'LWin'
            };

            keys.forEach((key, index) => {
                const mappedKey = keyMap[key] || key.toUpperCase();
                if (index < keys.length - 1) {
                    psCommand += `+${mappedKey}`;
                } else {
                    psCommand += mappedKey;
                }
            });

            execSync(`powershell -Command "[System.Windows.Forms.SendKeys]::SendWait('${psCommand}')"`);

        } catch (e) {
            console.error(`Shortcut error: ${e.message}`);
        }
    }

    getSystemInfo() {
        const os = require('os');
        return {
            cpu: `${os.cpus()[0].model} (${os.cpus().length} cores)`,
            ram: `${(os.totalmem() / (1024 ** 3)).toFixed(2)} GB total, ${(os.freemem() / (1024 ** 3)).toFixed(2)} GB free`,
            battery: this.getBatteryStatus()
        };
    }

    startBatteryMonitor() {
        this.checkBatteryInterval = setInterval(async () => {
            const battery = await this.getBatteryStatus();
            if (!battery || !this.ownerNumber) return;

            if (battery <= this.batteryThresholds.low && battery > this.batteryThresholds.critical) {
                await this.client.sendMessage(this.ownerNumber, `Battery low hai, ${battery}% bacha! Charger laga le! 🔋`);
            } else if (battery <= this.batteryThresholds.critical) {
                await this.client.sendMessage(this.ownerNumber, `Battery critical, ${battery}% bacha! Ab toh charger daal de! 🚨`);
                this.speak(`Battery ${battery} percent pe hai, jaldi charge karo!`);
            }
        }, 5 * 60 * 1000);
    }

    stopBatteryMonitor() {
        if (this.checkBatteryInterval) clearInterval(this.checkBatteryInterval);
    }
}

module.exports = SystemControl;