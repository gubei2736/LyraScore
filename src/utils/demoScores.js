/**
 * 内置高质量示范乐谱生成器 (PDF, MusicXML, 图片)
 * 首次进入应用时自动注入，用户打开立即可体验全套阅读、自动翻谱与手写笔功能
 */

import { scoreDB } from '../core/db.js';

// 1. 标准 MusicXML 示例: 贝多芬《月光奏鸣曲 第一乐章》(Moonlight Sonata)
export const MOONLIGHT_MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work>
    <work-title>Sonata No. 14 in C-sharp minor "Moonlight"</work-title>
  </work>
  <identification>
    <creator type="composer">Ludwig van Beethoven (Op. 27 No. 2)</creator>
    <encoding>
      <software>LyraScore Engine</software>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key>
          <fifths>4</fifths>
          <mode>minor</mode>
        </key>
        <time>
          <beats>2</beats>
          <beat-type>2</beat-type>
        </time>
        <clef number="1">
          <sign>G</sign>
          <line>2</line>
        </clef>
        <clef number="2">
          <sign>F</sign>
          <line>4</line>
        </clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <words font-style="italic" font-weight="bold">Adagio sostenuto</words>
        </direction-type>
      </direction>
      <direction placement="below">
        <direction-type>
          <dynamics><pp/></dynamics>
        </direction-type>
      </direction>
      <!-- 小节 1 音符 -->
      <note>
        <pitch><step>G</step><alter>1</alter><octave>3</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>G</step><alter>1</alter><octave>3</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>G</step><alter>1</alter><octave>3</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>2</octave></pitch>
        <duration>8</duration>
        <voice>2</voice>
        <type>half</type>
        <staff>2</staff>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>G</step><alter>1</alter><octave>3</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>G</step><alter>1</alter><octave>3</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>16th</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>B</step><octave>1</octave></pitch>
        <duration>8</duration>
        <voice>2</voice>
        <type>half</type>
        <staff>2</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

/**
 * 动态生成经典高分辨率五线谱图片 (用于图片乐谱示范)
 */
function createBachSuiteImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1700;
  const ctx = canvas.getContext('2d');

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 标题
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.font = 'bold 36px "Georgia", serif';
  ctx.fillText('Cello Suite No. 1 in G Major - Prélude', 600, 100);

  ctx.font = 'italic 20px "Georgia", serif';
  ctx.fillText('BWV 1007', 600, 135);

  ctx.textAlign = 'right';
  ctx.font = '18px "Inter", sans-serif';
  ctx.fillText('Johann Sebastian Bach', 1080, 155);

  ctx.textAlign = 'left';
  ctx.font = 'bold italic 22px "Georgia", serif';
  ctx.fillText('Moderato', 120, 190);

  // 绘制 6 组标准五线谱谱表
  const startY = 240;
  const staffSpacing = 220;
  const lineSpacing = 16;

  for (let s = 0; s < 6; s++) {
    const y0 = startY + s * staffSpacing;

    // 绘制 5 条横线
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1.6;
    for (let l = 0; l < 5; l++) {
      ctx.beginPath();
      ctx.moveTo(120, y0 + l * lineSpacing);
      ctx.lineTo(1080, y0 + l * lineSpacing);
      ctx.stroke();
    }

    // 左小节线 & 右小节线
    ctx.beginPath();
    ctx.moveTo(120, y0);
    ctx.lineTo(120, y0 + 4 * lineSpacing);
    ctx.moveTo(1080, y0);
    ctx.lineTo(1080, y0 + 4 * lineSpacing);
    ctx.stroke();

    // 谱号与调号 (高音/中音谱号与升号示意)
    ctx.fillStyle = '#111827';
    ctx.font = '60px "Georgia", serif';
    ctx.fillText('𝄞', 130, y0 + 52);

    ctx.font = 'bold 28px "Georgia", serif';
    ctx.fillText('♯', 180, y0 + 28); // G大调 1 升号

    // 拍号 4/4
    ctx.font = 'bold 36px "Georgia", serif';
    ctx.fillText('𝄴', 215, y0 + 45);

    // 绘制示意音符与符杆
    for (let m = 0; m < 4; m++) {
      const barX = 270 + m * 200;
      // 小节线
      ctx.strokeStyle = '#555555';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(barX + 190, y0);
      ctx.lineTo(barX + 190, y0 + 4 * lineSpacing);
      ctx.stroke();

      // 绘制音符群 (十六分音符组)
      for (let n = 0; n < 4; n++) {
        const nx = barX + n * 45 + 15;
        const notePitch = ((s * 3 + m * 2 + n) % 7);
        const ny = y0 + 4 * lineSpacing - notePitch * 8;

        // 符头
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.ellipse(nx, ny, 7, 5, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // 符杆
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(nx + 6, ny);
        ctx.lineTo(nx + 6, ny - 35);
        ctx.stroke();
      }

      // 连梁
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(barX + 21, y0 + 4 * lineSpacing - 45);
      ctx.lineTo(barX + 156, y0 + 4 * lineSpacing - 45);
      ctx.stroke();
    }
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}

/**
 * 动态创建多页示例 (第 1 页 & 第 2 页)
 */
function createMultiPageImages() {
  const page1 = createBachSuiteImage();

  // 第 2 页
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1700;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#374151';
  ctx.textAlign = 'center';
  ctx.font = '20px "Georgia", serif';
  ctx.fillText('- Page 2 -', 600, 60);

  // 谱表
  const startY = 100;
  const staffSpacing = 220;
  const lineSpacing = 16;

  for (let s = 0; s < 7; s++) {
    const y0 = startY + s * staffSpacing;
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1.6;
    for (let l = 0; l < 5; l++) {
      ctx.beginPath();
      ctx.moveTo(120, y0 + l * lineSpacing);
      ctx.lineTo(1080, y0 + l * lineSpacing);
      ctx.stroke();
    }
    ctx.fillStyle = '#111827';
    ctx.font = '60px "Georgia", serif';
    ctx.fillText('𝄞', 130, y0 + 52);
  }

  const page2 = canvas.toDataURL('image/jpeg', 0.9);
  return [page1, page2];
}

/**
 * 首次启动自动初始化内置乐谱
 */
export async function initDefaultScoresIfEmpty() {
  const allScores = await scoreDB.getAllScores();
  if (allScores.length > 0) return;

  const now = Date.now();
  const multiImages = createMultiPageImages();

  const demoScores = [
    {
      id: 'score_demo_xml_1',
      title: '月光奏鸣曲 第一乐章 (Moonlight Sonata)',
      composer: '贝多芬 (L. v. Beethoven)',
      format: 'xml',
      keySignature: 'c_sharp_minor',
      tags: ['练习中', '古典', '钢琴', '独奏'],
      fileData: MOONLIGHT_MUSICXML,
      pageCount: 1,
      isFavorite: true,
      createTime: now - 3600000 * 24,
      updateTime: now,
      lastReadTime: now
    },
    {
      id: 'score_demo_img_1',
      title: 'G大调第一大提琴组曲 前奏曲 (BWV 1007)',
      composer: '巴赫 (J. S. Bach)',
      format: 'image',
      keySignature: 'G_Major',
      tags: ['古典', '大提琴', '视奏', '已掌握'],
      fileData: multiImages,
      pageCount: 2,
      coverUrl: multiImages[0],
      isFavorite: true,
      createTime: now - 3600000 * 48,
      updateTime: now,
      lastReadTime: now - 3600000
    }
  ];

  for (const score of demoScores) {
    await scoreDB.saveScore(score);
  }
}
