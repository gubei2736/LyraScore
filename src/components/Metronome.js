/**
 * 专业节拍器 UI 组件 (Metronome Component)
 * 具备：
 * 1. 顶部紧凑状态胶囊 + 动态声光节奏动画
 * 2. 自由自定义重拍模式 (点按任意拍切换 重拍/弱拍/休止)
 * 3. 顶部工具栏全景闪烁开关 (开启后全工具栏随节拍律动呼吸闪烁)
 * 4. 40 ~ 240 BPM 自由调速 + Tap Tempo 测速打拍
 * 5. 常见拍号预设 (2/4, 3/4, 4/4, 6/8) 及任意拍数自由增减
 */

import { MetronomeCore } from '../core/metronome.js';

export class Metronome {
  constructor(containerElement) {
    this.container = containerElement;
    this.core = new MetronomeCore();
    this.isPopoverOpen = false;
    this.isTopbarFlashEnabled = false; // 顶部工具栏全景闪烁开关 (默认关闭)

    // Tap Tempo 测速记录
    this.tapTimes = [];

    this.render();
    this.bindEvents();

    // 节拍跳动回调
    this.core.onBeatTick = (beatIndex, beatType) => {
      this.handleBeatTick(beatIndex, beatType);
    };
  }

  render() {
    const isPlaying = this.core.isPlaying;
    const bpm = this.core.bpm;
    const pattern = this.core.accentPattern;
    const isMuted = this.core.isMuted;

    this.container.innerHTML = `
      <div class="topbar-metronome-widget ${isPlaying ? 'running' : 'idle'}" id="metronomeWidget">
        <!-- 顶部胶囊主按钮 -->
        <button class="topbar-metro-btn" id="metroMainToggleBtn" title="${isPlaying ? '停止节拍器' : '启动节拍器'}">
          <span class="metro-play-icon" id="metroPlayIcon">${isPlaying ? '⏸' : '▶'}</span>
          <span class="metro-bpm-text" id="metroCapsuleBpmText">节拍 ${bpm}</span>
        </button>

        <!-- 齿轮/展开设置面板按钮 -->
        <button class="topbar-metro-gear-btn" id="metroSettingsBtn" title="节拍器详细设置">
          ⏱️
        </button>

        <!-- 水晶毛玻璃控制面板 -->
        <div class="topbar-metro-popover ${this.isPopoverOpen ? 'open' : ''}" id="metroPopover">
          <div class="metro-popover-header">
            <span>🎵 专业节拍器</span>
            <button class="stamp-close-btn" id="metroCloseBtn">✕</button>
          </div>

          <!-- 自定义重拍交互点阵 (点击可切换: 🔴重拍 / 🔵弱拍 / ⚪静音) -->
          <div class="metro-custom-accents-section">
            <div class="metro-accents-header">
              <span class="accents-title">重拍自定义 (轻触小圆灯切换)</span>
              <div class="metro-beats-counter">
                <button class="beats-step-btn" id="metroMinusBeatBtn" title="减少一拍">-</button>
                <span class="beats-count-text">${pattern.length} 拍</span>
                <button class="beats-step-btn" id="metroPlusBeatBtn" title="增加一拍">+</button>
              </div>
            </div>

            <div class="metro-beat-dots-interactive" id="metroInteractiveDots">
              ${pattern.map((type, idx) => {
                let typeClass = 'type-normal';
                let label = '弱';
                if (type === 1) {
                  typeClass = 'type-accent';
                  label = '重';
                } else if (type === -1) {
                  typeClass = 'type-mute';
                  label = '休';
                }
                return `
                  <button class="interactive-beat-pill ${typeClass}" data-beat-idx="${idx}" title="第 ${idx + 1} 拍：点击切换重拍/弱拍/休止">
                    <span class="pill-number">${idx + 1}</span>
                    <span class="pill-type-label">${label}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <!-- BPM 仪表核心调节区 -->
          <div class="metro-bpm-control-row">
            <button class="metro-step-btn" id="metroMinus5Btn" title="-5 BPM">-5</button>
            <button class="metro-step-btn" id="metroMinus1Btn" title="-1 BPM">-1</button>
            <div class="metro-bpm-display-box">
              <span class="metro-bpm-number" id="metroBpmNumber">${bpm}</span>
              <span class="metro-bpm-sub">BPM</span>
            </div>
            <button class="metro-step-btn" id="metroPlus1Btn" title="+1 BPM">+1</button>
            <button class="metro-step-btn" id="metroPlus5Btn" title="+5 BPM">+5</button>
          </div>

          <!-- BPM 滑动条 -->
          <div class="metro-slider-row">
            <input type="range" class="size-slider" id="metroBpmSlider" min="40" max="240" step="1" value="${bpm}">
          </div>

          <!-- 拍号预设与 Tap Tempo 测速 -->
          <div class="metro-meta-row">
            <div class="metro-time-signatures">
              <button class="metro-sig-btn ${pattern.length === 2 ? 'active' : ''}" data-beats="2">2/4</button>
              <button class="metro-sig-btn ${pattern.length === 3 ? 'active' : ''}" data-beats="3">3/4</button>
              <button class="metro-sig-btn ${pattern.length === 4 ? 'active' : ''}" data-beats="4">4/4</button>
              <button class="metro-sig-btn ${pattern.length === 6 ? 'active' : ''}" data-beats="6">6/8</button>
            </div>
            <button class="metro-tap-btn" id="metroTapBtn" title="连续轻点测速">TAP 测速</button>
          </div>

          <!-- 顶部工具栏全景闪烁开关 (新增功能) -->
          <div class="metro-toggle-row">
            <span class="toggle-row-label">💡 顶部工具栏全景闪烁</span>
            <label class="metro-switch">
              <input type="checkbox" id="metroTopbarFlashSwitch" ${this.isTopbarFlashEnabled ? 'checked' : ''}>
              <span class="metro-slider-toggle"></span>
            </label>
          </div>

          <!-- 静音与音量控制 -->
          <div class="metro-sound-row">
            <button class="metro-mute-btn ${isMuted ? 'muted' : ''}" id="metroMuteToggleBtn" title="切换声音/静音视觉对拍">
              ${isMuted ? '🔇 静音闪烁' : '🔊 声音已开'}
            </button>
            <input type="range" class="metro-vol-slider" id="metroVolSlider" min="0" max="1" step="0.05" value="${this.core.volume}" title="节拍器音量">
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // 胶囊播放/暂停
    this.container.querySelector('#metroMainToggleBtn')?.addEventListener('click', () => {
      this.toggle();
    });

    // 展开/收起设置面板
    this.container.querySelector('#metroSettingsBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isPopoverOpen = !this.isPopoverOpen;
      this.container.querySelector('#metroPopover')?.classList.toggle('open', this.isPopoverOpen);
    });

    this.container.querySelector('#metroCloseBtn')?.addEventListener('click', () => {
      this.isPopoverOpen = false;
      this.container.querySelector('#metroPopover')?.classList.remove('open');
    });

    // 自定义重拍点按切换
    this.container.querySelectorAll('.interactive-beat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.beatIdx, 10);
        this.core.toggleBeatAccent(idx);
        this.render();
        this.bindEvents();
      });
    });

    // 拍数增减
    this.container.querySelector('#metroMinusBeatBtn')?.addEventListener('click', () => {
      if (this.core.accentPattern.length > 1) {
        const newPattern = this.core.accentPattern.slice(0, -1);
        this.core.setAccentPattern(newPattern);
        this.render();
        this.bindEvents();
      }
    });

    this.container.querySelector('#metroPlusBeatBtn')?.addEventListener('click', () => {
      if (this.core.accentPattern.length < 12) {
        const newPattern = [...this.core.accentPattern, 0];
        this.core.setAccentPattern(newPattern);
        this.render();
        this.bindEvents();
      }
    });

    // BPM 加减微调
    this.container.querySelector('#metroMinus5Btn')?.addEventListener('click', () => this.changeBpmBy(-5));
    this.container.querySelector('#metroMinus1Btn')?.addEventListener('click', () => this.changeBpmBy(-1));
    this.container.querySelector('#metroPlus1Btn')?.addEventListener('click', () => this.changeBpmBy(1));
    this.container.querySelector('#metroPlus5Btn')?.addEventListener('click', () => this.changeBpmBy(5));

    // BPM 滑动条
    this.container.querySelector('#metroBpmSlider')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.setBpm(val);
    });

    // 拍号预设
    this.container.querySelectorAll('.metro-sig-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const b = parseInt(btn.dataset.beats, 10);
        this.core.setTimeSignature(b);
        this.render();
        this.bindEvents();
      });
    });

    // Tap Tempo 测速打拍
    this.container.querySelector('#metroTapBtn')?.addEventListener('click', () => {
      this.handleTapTempo();
    });

    // 顶部全景闪烁开关
    this.container.querySelector('#metroTopbarFlashSwitch')?.addEventListener('change', (e) => {
      this.isTopbarFlashEnabled = e.target.checked;
    });

    // 静音切换
    this.container.querySelector('#metroMuteToggleBtn')?.addEventListener('click', () => {
      this.core.setMuted(!this.core.isMuted);
      this.render();
      this.bindEvents();
    });

    // 音量调节
    this.container.querySelector('#metroVolSlider')?.addEventListener('input', (e) => {
      this.core.setVolume(parseFloat(e.target.value));
    });
  }

  toggle() {
    const isPlaying = this.core.toggle();
    this.updateWidgetState(isPlaying);
  }

  setBpm(bpm) {
    this.core.setBpm(bpm);
    const numEl = this.container.querySelector('#metroBpmNumber');
    const capText = this.container.querySelector('#metroCapsuleBpmText');
    const slider = this.container.querySelector('#metroBpmSlider');

    if (numEl) numEl.textContent = this.core.bpm;
    if (capText) capText.textContent = `节拍 ${this.core.bpm}`;
    if (slider) slider.value = this.core.bpm;
  }

  changeBpmBy(delta) {
    this.setBpm(this.core.bpm + delta);
  }

  handleTapTempo() {
    const now = Date.now();
    this.tapTimes.push(now);

    this.tapTimes = this.tapTimes.filter(t => now - t < 3000);

    if (this.tapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < this.tapTimes.length; i++) {
        intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]);
      }
      const avgIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgIntervalMs > 0) {
        const calculatedBpm = Math.round(60000 / avgIntervalMs);
        if (calculatedBpm >= 40 && calculatedBpm <= 240) {
          this.setBpm(calculatedBpm);
        }
      }
    }
  }

  handleBeatTick(beatIndex, beatType) {
    // 1. 节拍器胶囊微闪烁
    const widget = this.container.querySelector('#metronomeWidget');
    if (widget) {
      widget.classList.add(beatType === 1 ? 'beat-flash-accent' : 'beat-flash-normal');
      setTimeout(() => {
        widget.classList.remove('beat-flash-accent', 'beat-flash-normal');
      }, 90);
    }

    // 2. 顶部工具栏全景闪烁 (若用户开启了开关)
    if (this.isTopbarFlashEnabled) {
      const topbar = document.getElementById('readerTopbar');
      if (topbar) {
        const flashClass = (beatType === 1) ? 'topbar-flash-accent' : 'topbar-flash-normal';
        topbar.classList.add(flashClass);
        setTimeout(() => {
          topbar.classList.remove('topbar-flash-accent', 'topbar-flash-normal');
        }, 110);
      }
    }

    // 3. 面板内交互小药丸高亮
    const pills = this.container.querySelectorAll('.interactive-beat-pill');
    pills.forEach((pill, idx) => {
      if (idx === beatIndex) {
        pill.classList.add('ticking-now');
      } else {
        pill.classList.remove('ticking-now');
      }
    });
  }

  updateWidgetState(isPlaying) {
    const widget = this.container.querySelector('#metronomeWidget');
    const playIcon = this.container.querySelector('#metroPlayIcon');

    if (widget) {
      widget.classList.toggle('running', isPlaying);
      widget.classList.toggle('idle', !isPlaying);
    }
    if (playIcon) {
      playIcon.textContent = isPlaying ? '⏸' : '▶';
    }
  }

  destroy() {
    this.core.stop();
  }
}
