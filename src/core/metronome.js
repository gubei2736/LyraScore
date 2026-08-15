/**
 * 高精度专业节拍器调度引擎 (Web Audio Lookahead Scheduler)
 * 采用 Web Audio API 的精准硬件时钟进行微秒级节奏调度，杜绝 JS 定时器漂移与卡顿
 */

export class MetronomeCore {
  constructor() {
    this.audioCtx = null;
    this.bpm = 120;
    this.beatsPerBar = 4; // 拍号: 4/4
    this.beatUnit = 4;
    this.volume = 0.8;
    this.isMuted = false;
    this.isPlaying = false;

    this.currentBeatInBar = 0; // 0-based
    this.nextNoteTime = 0.0;
    this.timerWorkerId = null;
    this.lookaheadMs = 25.0; // 调度轮询周期 (ms)
    this.scheduleAheadTime = 0.1; // 预调度时间窗 (s)

    this.onBeatTick = null; // 回调: (currentBeatInBar, isFirstBeat) => {}
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
    this.beatsPerBar = parseInt(beats, 10) || 4;
    this.beatUnit = parseInt(unit, 10) || 4;
    this.currentBeatInBar = 0;
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
    const isFirstBeat = (beatNumber === 0);

    // 触发 UI 视觉光点闪烁同步 (借助 setTimeout 对齐音频播放时刻)
    const delayMs = Math.max(0, (time - this.audioCtx.currentTime) * 1000);
    setTimeout(() => {
      if (this.isPlaying && this.onBeatTick) {
        this.onBeatTick(beatNumber, isFirstBeat);
      }
    }, delayMs);

    // 发声合成 (若静音模式则不发声，纯视觉对拍)
    if (this.isMuted || this.volume <= 0.01) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      // 第一拍为清脆高音，其余拍为沉稳弱音 (经典木鱼/发条节拍器音色)
      if (isFirstBeat) {
        osc.frequency.setValueAtTime(1046.5, time); // C6 高亢重音
      } else {
        osc.frequency.setValueAtTime(523.25, time); // C5 柔和副拍
      }

      const noteVolume = isFirstBeat ? this.volume : this.volume * 0.7;
      gain.gain.setValueAtTime(noteVolume, time);
      // 快速指数衰减
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

      osc.start(time);
      osc.stop(time + 0.045);
    } catch (_) {}
  }
}
