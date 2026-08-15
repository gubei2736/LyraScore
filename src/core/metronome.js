/**
 * 高精度专业节拍器调度引擎 (Web Audio Lookahead Scheduler)
 * 采用精准硬件时钟进行微秒级节奏调度，支持全自由自定义重拍模式 (Accents Customization)
 */

export class MetronomeCore {
  constructor() {
    this.audioCtx = null;
    this.bpm = 120;
    this.beatsPerBar = 4; // 拍号: 4/4
    this.beatUnit = 4;
    // 拍型模式数组: 1 = 重拍 (Accent), 0 = 弱拍 (Normal), -1 = 静音拍 (Muted)
    this.accentPattern = [1, 0, 0, 0];
    this.volume = 0.8;
    this.isMuted = false;
    this.isPlaying = false;

    this.currentBeatInBar = 0; // 0-based
    this.nextNoteTime = 0.0;
    this.timerWorkerId = null;
    this.lookaheadMs = 25.0;
    this.scheduleAheadTime = 0.1;

    this.onBeatTick = null; // 回调: (beatIndex, beatType) => {}  type: 1(重), 0(弱), -1(静音)
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setBpm(newBpm) {
    this.bpm = Math.min(Math.max(parseInt(newBpm, 10) || 120, 30), 260);
  }

  setTimeSignature(beats, unit = 4) {
    this.beatsPerBar = Math.min(Math.max(parseInt(beats, 10) || 4, 1), 16);
    this.beatUnit = parseInt(unit, 10) || 4;

    // 重构重拍模式数组 (第一拍默认重拍，其余弱拍)
    this.accentPattern = Array.from({ length: this.beatsPerBar }, (_, i) => i === 0 ? 1 : 0);
    this.currentBeatInBar = 0;
  }

  setAccentPattern(pattern) {
    if (Array.isArray(pattern) && pattern.length > 0) {
      this.accentPattern = pattern;
      this.beatsPerBar = pattern.length;
    }
  }

  toggleBeatAccent(index) {
    if (index >= 0 && index < this.accentPattern.length) {
      const cur = this.accentPattern[index];
      // 循环切换: 1(重拍) -> 0(弱拍) -> -1(静音) -> 1(重拍)
      if (cur === 1) {
        this.accentPattern[index] = 0;
      } else if (cur === 0) {
        this.accentPattern[index] = -1;
      } else {
        this.accentPattern[index] = 1;
      }
    }
  }

  setVolume(vol) {
    this.volume = Math.min(Math.max(parseFloat(vol) || 0, 0), 1.0);
  }

  setMuted(muted) {
    this.isMuted = !!muted;
  }

  toggle() {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
    return this.isPlaying;
  }

  start() {
    if (this.isPlaying) return;
    this.ensureAudioContext();
    this.isPlaying = true;
    this.currentBeatInBar = 0;
    this.nextNoteTime = this.audioCtx.currentTime + 0.05;

    this.schedulerLoop();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerWorkerId) {
      clearTimeout(this.timerWorkerId);
      this.timerWorkerId = null;
    }
    this.currentBeatInBar = 0;
  }

  schedulerLoop() {
    if (!this.isPlaying) return;

    while (this.nextNoteTime < this.audioCtx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentBeatInBar, this.nextNoteTime);
      this.advanceNote();
    }

    this.timerWorkerId = setTimeout(() => {
      this.schedulerLoop();
    }, this.lookaheadMs);
  }

  advanceNote() {
    const secondsPerBeat = 60.0 / this.bpm;
    this.nextNoteTime += secondsPerBeat;
    this.currentBeatInBar = (this.currentBeatInBar + 1) % this.beatsPerBar;
  }

  scheduleNote(beatNumber, time) {
    const beatType = this.accentPattern[beatNumber] !== undefined ? this.accentPattern[beatNumber] : 0;

    // 触发 UI 视觉闪烁对齐
    const delayMs = Math.max(0, (time - this.audioCtx.currentTime) * 1000);
    setTimeout(() => {
      if (this.isPlaying && this.onBeatTick) {
        this.onBeatTick(beatNumber, beatType);
      }
    }, delayMs);

    // 如果全局静音或当前拍被用户设为静音拍(-1)，则不发声
    if (this.isMuted || beatType === -1 || this.volume <= 0.01) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const isAccent = (beatType === 1);

      // 重拍高亢清脆，弱拍沉稳
      if (isAccent) {
        osc.frequency.setValueAtTime(1046.5, time); // C6
      } else {
        osc.frequency.setValueAtTime(523.25, time); // C5
      }

      const noteVolume = isAccent ? this.volume : this.volume * 0.65;
      gain.gain.setValueAtTime(noteVolume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

      osc.start(time);
      osc.stop(time + 0.045);
    } catch (_) {}
  }
}
