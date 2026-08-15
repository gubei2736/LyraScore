/**
 * 现代高保真确认对话框 (Modern Confirm Dialog Modal)
 * 替代陈旧的系统 window.confirm()，提供与应用完全统一的水晶毛玻璃与现代设计质感
 */

export function showConfirmDialog({
  title = '确认操作',
  message = '确定要继续执行此操作吗？',
  confirmText = '确定',
  cancelText = '取消',
  isDanger = false
} = {}) {
  return new Promise((resolve) => {
    // 移除已存在的弹窗
    const existing = document.getElementById('lyraConfirmModalContainer');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'lyraConfirmModalContainer';
    overlay.className = 'custom-dialog-overlay';

    overlay.innerHTML = `
      <div class="custom-dialog-card" role="dialog" aria-modal="true">
        <div class="dialog-header">
          <div class="dialog-icon-box ${isDanger ? 'danger' : 'info'}">
            ${isDanger ? '⚠️' : 'ℹ️'}
          </div>
          <h3 class="dialog-title">${escapeHtml(title)}</h3>
        </div>
        <div class="dialog-body">
          <p class="dialog-message">${escapeHtml(message)}</p>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-secondary dialog-cancel-btn" id="dialogCancelBtn">${escapeHtml(cancelText)}</button>
          <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'} dialog-confirm-btn" id="dialogConfirmBtn">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // 进场动画
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

    const close = (result) => {
      overlay.classList.remove('visible');
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        resolve(result);
      }, 200);
    };

    overlay.querySelector('#dialogCancelBtn')?.addEventListener('click', () => close(false));
    overlay.querySelector('#dialogConfirmBtn')?.addEventListener('click', () => close(true));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close(false);
      }
    });

    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', handleKeydown);
        close(false);
      } else if (e.key === 'Enter') {
        window.removeEventListener('keydown', handleKeydown);
        close(true);
      }
    };
    window.addEventListener('keydown', handleKeydown);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
