// ============================================
// DEAD PARIS - UI Module
// Output rendering, status bar, inventory, modals
// ============================================

import World from './world.js';

const UI = {
    outputArea: null,
    commandInput: null,
    statusBar: {},
    typewriterSpeed: 12,
    typewriterQueue: [],
    isTypewriting: false,
    commandHistory: [],
    historyIndex: -1,
    maxMessages: 300,
    inputEnabled: true,
    onCommand: null,
    onEnter: null,

    init() {
        this.outputArea = document.getElementById('output-area');
        this.commandInput = document.getElementById('command-input');
        this.statusBar = {
            health: document.getElementById('stat-health'),
            healthVal: document.getElementById('stat-health-val'),
            hunger: document.getElementById('stat-hunger'),
            hungerVal: document.getElementById('stat-hunger-val'),
            thirst: document.getElementById('stat-thirst'),
            thirstVal: document.getElementById('stat-thirst-val'),
            day: document.getElementById('stat-day'),
            dayVal: document.getElementById('stat-day-val'),
            time: document.getElementById('stat-time'),
            timeVal: document.getElementById('stat-time-val'),
            location: document.getElementById('stat-location'),
            locationVal: document.getElementById('stat-location-val')
        };

        this.commandInput.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('click', (e) => {
            if (this.inputEnabled && !e.target.closest('#help-modal') && !e.target.closest('#help-btn') && !e.target.closest('#intro-modal')) {
                this.commandInput.focus();
            }
        });

        // Help modal
        const helpBtn = document.getElementById('help-btn');
        const helpModal = document.getElementById('help-modal');
        const helpClose = document.getElementById('help-close');

        helpBtn.addEventListener('click', () => {
            helpModal.style.display = 'flex';
        });
        helpClose.addEventListener('click', () => {
            helpModal.style.display = 'none';
        });
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) helpModal.style.display = 'none';
        });
    },

    showIntroModal(onBegin) {
        const introModal = document.getElementById('intro-modal');
        const beginBtn = document.getElementById('intro-begin-btn');
        introModal.style.display = 'flex';

        beginBtn.addEventListener('click', () => {
            introModal.style.display = 'none';
            if (onBegin) onBegin();
        });
    },

    handleKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (this.isTypewriting) {
                this.skipTypewriter();
                return;
            }
            const input = this.commandInput.value.trim();
            if (this.onEnter) {
                this.onEnter(input);
                this.commandInput.value = '';
                return;
            }
            if (!input) return;
            this.commandHistory.unshift(input);
            if (this.commandHistory.length > 50) this.commandHistory.pop();
            this.historyIndex = -1;
            this.commandInput.value = '';
            this.print(`> ${input}`, 'input-echo');
            if (this.onCommand) this.onCommand(input);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this.historyIndex < this.commandHistory.length - 1) {
                this.historyIndex++;
                this.commandInput.value = this.commandHistory[this.historyIndex];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this.historyIndex > 0) {
                this.historyIndex--;
                this.commandInput.value = this.commandHistory[this.historyIndex];
            } else {
                this.historyIndex = -1;
                this.commandInput.value = '';
            }
        }
    },

    print(text, cssClass = '') {
        if (this.isTypewriting) {
            this.typewriterQueue.push({ text, cssClass });
            return;
        }
        const el = document.createElement('p');
        el.className = `message ${cssClass}`;
        el.textContent = text;
        this.outputArea.appendChild(el);
        this.trimMessages();
        this.scrollToBottom();
    },

    printHTML(html, cssClass = '') {
        const el = document.createElement('p');
        el.className = `message ${cssClass}`;
        el.innerHTML = html;
        this.outputArea.appendChild(el);
        this.trimMessages();
        this.scrollToBottom();
    },

    printBlank() {
        const el = document.createElement('p');
        el.className = 'message blank';
        this.outputArea.appendChild(el);
        this.scrollToBottom();
    },

    printLines(lines, cssClass = '') {
        lines.forEach(line => {
            if (line === '') {
                this.printBlank();
            } else {
                this.print(line, cssClass);
            }
        });
    },

    async typewrite(text, cssClass = '', speed = null) {
        const s = speed || this.typewriterSpeed;
        this.isTypewriting = true;
        const el = document.createElement('p');
        el.className = `message ${cssClass}`;
        this.outputArea.appendChild(el);
        this.scrollToBottom();

        for (let i = 0; i < text.length; i++) {
            if (!this.isTypewriting) {
                el.textContent = text;
                break;
            }
            el.textContent = text.substring(0, i + 1);
            this.scrollToBottom();
            await this.sleep(s);
        }
        this.isTypewriting = false;

        while (this.typewriterQueue.length > 0) {
            const queued = this.typewriterQueue.shift();
            this.print(queued.text, queued.cssClass);
        }
    },

    async typewriteLines(lines, cssClass = '', speed = null) {
        for (const line of lines) {
            if (line === '') {
                this.printBlank();
                await this.sleep(200);
            } else {
                await this.typewrite(line, cssClass, speed);
            }
        }
    },

    skipTypewriter() {
        this.isTypewriting = false;
    },

    trimMessages() {
        while (this.outputArea.children.length > this.maxMessages) {
            this.outputArea.removeChild(this.outputArea.firstChild);
        }
    },

    scrollToBottom() {
        this.outputArea.scrollTop = this.outputArea.scrollHeight;
    },

    clearOutput() {
        this.outputArea.innerHTML = '';
    },

    enableInput() {
        this.inputEnabled = true;
        this.commandInput.disabled = false;
        this.commandInput.focus();
        document.getElementById('input-area').style.display = 'flex';
    },

    disableInput() {
        this.inputEnabled = false;
        this.commandInput.disabled = true;
    },

    hideInput() {
        document.getElementById('input-area').style.display = 'none';
    },

    showInput() {
        document.getElementById('input-area').style.display = 'flex';
    },

    updateStatusBar(state) {
        const p = state.player;
        const t = state.world.time;

        // Health
        this.statusBar.healthVal.textContent = `${p.health}/${p.maxHealth}`;
        this.statusBar.health.className = 'stat-badge';
        if (p.health <= 10) this.statusBar.health.classList.add('critical');
        else if (p.health <= 30) this.statusBar.health.classList.add('warning');

        // Hunger
        this.statusBar.hungerVal.textContent = `${p.hunger}/100`;
        this.statusBar.hunger.className = 'stat-badge';
        if (p.hunger <= 20) this.statusBar.hunger.classList.add('critical');
        else if (p.hunger <= 40) this.statusBar.hunger.classList.add('warning');

        // Thirst
        this.statusBar.thirstVal.textContent = `${p.thirst}/100`;
        this.statusBar.thirst.className = 'stat-badge';
        if (p.thirst <= 10) this.statusBar.thirst.classList.add('critical');
        else if (p.thirst <= 30) this.statusBar.thirst.classList.add('warning');

        // Day
        this.statusBar.dayVal.textContent = `${t.day} / 30`;

        // Time
        const hour = String(t.hour).padStart(2, '0');
        const min = String(t.minute).padStart(2, '0');
        this.statusBar.timeVal.textContent = `${hour}:${min}`;
        this.statusBar.time.className = 'stat-badge';
        if (t.hour >= 21 || t.hour < 6) this.statusBar.time.classList.add('night');

        // Location
        this.statusBar.locationVal.textContent = state.currentRoomName || '';
    },

    updateInventory(state) {
        const p = state.player;
        const invItems = document.getElementById('inv-items');
        const weaponName = document.getElementById('inv-weapon-name');
        const armorName = document.getElementById('inv-armor-name');
        const weightFill = document.getElementById('inv-weight-fill');
        const weightText = document.getElementById('inv-weight-text');

        // Equipped slots
        if (p.equippedWeapon) {
            weaponName.textContent = p.equippedWeapon.name || p.equippedWeapon.id;
            weaponName.className = 'inv-slot-value active';
        } else {
            weaponName.textContent = '\u2014';
            weaponName.className = 'inv-slot-value';
        }

        if (p.equippedArmor) {
            armorName.textContent = p.equippedArmor.name || p.equippedArmor.id;
            armorName.className = 'inv-slot-value active';
        } else {
            armorName.textContent = '\u2014';
            armorName.className = 'inv-slot-value';
        }

        // Item list
        invItems.innerHTML = '';
        if (p.inventory.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'inv-empty';
            empty.textContent = 'Empty';
            invItems.appendChild(empty);
        } else {
            // Group by id and sum quantities
            const grouped = {};
            for (const entry of p.inventory) {
                if (grouped[entry.id]) {
                    grouped[entry.id].qty += (entry.quantity || 1);
                } else {
                    grouped[entry.id] = { id: entry.id, qty: entry.quantity || 1 };
                }
            }

            for (const [id, data] of Object.entries(grouped)) {
                const def = World.getItemDef(id);
                const name = def ? def.name : id;
                const isEquipped = (p.equippedWeapon && p.equippedWeapon.id === id) ||
                                   (p.equippedArmor && p.equippedArmor.id === id);

                const el = document.createElement('div');
                el.className = 'inv-item' + (isEquipped ? ' equipped' : '');

                const qtySpan = document.createElement('span');
                qtySpan.className = 'inv-qty';
                qtySpan.textContent = `${data.qty}x `;
                el.appendChild(qtySpan);
                el.appendChild(document.createTextNode(name));

                invItems.appendChild(el);
            }
        }

        // Weight
        // Calculate max weight including container bonuses
        let maxWeight = p.maxWeight;
        for (const entry of p.inventory) {
            const def = World.getItemDef(entry.id);
            if (def && def.carryCapacity) maxWeight += def.carryCapacity;
        }
        const weight = Math.round(p.currentWeight * 10) / 10;
        const pct = maxWeight > 0 ? Math.min(100, (weight / maxWeight) * 100) : 0;

        weightFill.style.width = pct + '%';
        weightFill.className = '';
        if (pct >= 90) weightFill.className = 'critical';
        else if (pct >= 70) weightFill.className = 'warning';

        weightText.textContent = `${weight} / ${maxWeight} kg`;
    },

    hideStatusBar() {
        document.getElementById('game-header').style.display = 'none';
        document.getElementById('stats-bar').style.display = 'none';
        document.getElementById('inventory-panel').style.display = 'none';
    },

    showStatusBar() {
        document.getElementById('game-header').style.display = 'flex';
        document.getElementById('stats-bar').style.display = 'flex';
        document.getElementById('inventory-panel').style.display = 'flex';
    },

    waitForKey() {
        return new Promise(resolve => {
            const handler = (e) => {
                if (e.key === 'Enter') {
                    document.removeEventListener('keydown', handler);
                    resolve();
                }
            };
            document.addEventListener('keydown', handler);
        });
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    getTimeOfDay(hour) {
        if (hour >= 6 && hour < 19) return 'day';
        if (hour >= 19 && hour < 21) return 'dusk';
        return 'night';
    }
};

export default UI;
