/**
 * 乐谱元数据编辑与副本创建弹窗 (ScoreMetaModal)
 * 支持乐谱重命名、24 种调式选择、自定义标签云与副本备注
 */

import { KEY_SIGNATURES, DEFAULT_TAGS } from '../core/state.js';
import { scoreDB } from '../core/db.js';

export class ScoreModal {
  constructor(containerElement, onSaveCallback) {
    this.container = containerElement;
    this.onSave = onSaveCallback || (() => {});
    this.currentScore = null;
    this.isCopyMode = false;
  }

  open(score, isCopyMode = false) {
    this.currentScore = score;
    this.isCopyMode = isCopyMode;
    this.render();
  }

  close() {
    this.container.innerHTML = '';
  }

  render() {
    const score = this.currentScore;
    if (!score) return;

    const modalTitle = this.isCopyMode ? '创建乐谱独立副本' : '编辑乐谱信息与标签';
    const defaultTitle = this.isCopyMode ? `${score.title} (副本)` : score.title;
    const currentTags = score.tags || [];

    this.container.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">${modalTitle}</h3>
            <button class="modal-close-btn" id="modalCloseBtn">✕</button>
          </div>
          <div class="modal-body">
            ${this.isCopyMode ? `
              <div class="modal-alert-info">
                ℹ️ 副本将继承当前乐谱的全部乐谱内容，但拥有<strong>完全独立的手写笔迹、独立标签与练习笔记</strong>。
              </div>
            ` : ''}

            <div class="form-group">
              <label class="form-label">乐谱标题</label>
              <input type="text" class="form-input" id="scoreTitleInput" value="${escapeHtml(defaultTitle)}" placeholder="请输入乐谱名称">
            </div>

            <div class="form-group">
              <label class="form-label">作曲家 / 创作者</label>
              <input type="text" class="form-input" id="scoreComposerInput" value="${escapeHtml(score.composer || '')}" placeholder="如：贝多芬 / 肖邦 / 原创">
            </div>

            <div class="form-group">
              <label class="form-label">调式 (Key Signature)</label>
              <select class="form-select" id="scoreKeySelect">
                <option value="">未指定调式</option>
                ${KEY_SIGNATURES.map(k => `
                  <option value="${k.id}" ${score.keySignature === k.id ? 'selected' : ''}>
                    ${k.name} - ${k.sharpsFlats}
                  </option>
                `).join('')}
              </select>
            </div>

            ${this.isCopyMode ? `
              <div class="form-group">
                <label class="form-label">副本用途备注</label>
                <input type="text" class="form-input" id="copyNoteInput" value="第一乐章指法标注版" placeholder="如：伴奏笔记版 / 演奏草稿">
              </div>
            ` : ''}

            <div class="form-group">
              <label class="form-label">乐谱标签 (点击添加/移除)</label>
              <div class="tag-cloud-selector" id="tagCloudSelector">
                ${Array.from(new Set([...DEFAULT_TAGS, ...currentTags])).map(tag => {
                  const isSelected = currentTags.includes(tag);
                  return `
                    <button type="button" class="tag-chip ${isSelected ? 'selected' : ''}" data-tag="${escapeHtml(tag)}">
                      ${isSelected ? '✓ ' : '+ '}${escapeHtml(tag)}
                    </button>
                  `;
                }).join('')}
              </div>
              <div class="custom-tag-input-row">
                <input type="text" class="form-input" id="customTagInput" placeholder="输入新标签名并回车">
                <button type="button" class="btn btn-secondary" id="addCustomTagBtn">添加标签</button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="modalCancelBtn">取消</button>
            <button class="btn btn-primary" id="modalSaveBtn">${this.isCopyMode ? '确认克隆副本' : '保存修改'}</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(currentTags);
  }

  bindEvents(initialTags) {
    let activeTags = [...initialTags];

    // 关闭
    this.container.querySelector('#modalCloseBtn')?.addEventListener('click', () => this.close());
    this.container.querySelector('#modalCancelBtn')?.addEventListener('click', () => this.close());

    // 标签点击切换
    const tagCloud = this.container.querySelector('#tagCloudSelector');
    tagCloud?.addEventListener('click', (e) => {
      const chip = e.target.closest('.tag-chip');
      if (!chip) return;
      const tag = chip.dataset.tag;
      if (activeTags.includes(tag)) {
        activeTags = activeTags.filter(t => t !== tag);
        chip.classList.remove('selected');
        chip.textContent = '+ ' + tag;
      } else {
        activeTags.push(tag);
        chip.classList.add('selected');
        chip.textContent = '✓ ' + tag;
      }
    });

    // 添加自定义标签
    const customTagInput = this.container.querySelector('#customTagInput');
    const addCustomTag = () => {
      const val = customTagInput.value.trim();
      if (!val || activeTags.includes(val)) return;
      activeTags.push(val);

      const newChip = document.createElement('button');
      newChip.type = 'button';
      newChip.className = 'tag-chip selected';
      newChip.dataset.tag = val;
      newChip.textContent = '✓ ' + val;
      tagCloud.appendChild(newChip);
      customTagInput.value = '';
    };

    this.container.querySelector('#addCustomTagBtn')?.addEventListener('click', addCustomTag);
    customTagInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomTag();
      }
    });

    // 保存
    this.container.querySelector('#modalSaveBtn')?.addEventListener('click', async () => {
      const title = this.container.querySelector('#scoreTitleInput').value.trim() || '未命名乐谱';
      const composer = this.container.querySelector('#scoreComposerInput').value.trim();
      const keySignature = this.container.querySelector('#scoreKeySelect').value;

      if (this.isCopyMode) {
        const copyNote = this.container.querySelector('#copyNoteInput')?.value.trim() || '个人练习批注版';
        const newScore = await scoreDB.createScoreCopy(this.currentScore.id, title, copyNote);
        newScore.composer = composer;
        newScore.keySignature = keySignature;
        newScore.tags = activeTags;
        await scoreDB.saveScore(newScore);
        this.close();
        this.onSave(newScore);
      } else {
        this.currentScore.title = title;
        this.currentScore.composer = composer;
        this.currentScore.keySignature = keySignature;
        this.currentScore.tags = activeTags;
        await scoreDB.saveScore(this.currentScore);
        this.close();
        this.onSave(this.currentScore);
      }
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
