import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { globby } from 'globby';

const SRC_DIR = path.join(process.cwd(), 'out', 'screenshots');
const OUT_PDF = path.join(process.cwd(), 'out', 'portfolio.pdf');

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

// 画像サイズを取得するヘルパー
function getImageSize(imagePath) {
  try {
    // PDFKitの内部メソッドで画像サイズを取得
    const doc = new PDFDocument({ autoFirstPage: false });
    const img = doc.openImage(imagePath);
    return { width: img.width, height: img.height };
  } catch (error) {
    // フォールバック: 一般的な画面サイズを返す
    console.warn(`⚠️  画像サイズ取得失敗: ${imagePath}. デフォルトサイズを使用します。`);
    return { width: 1280, height: 800 };
  }
}

async function makePdf() {
  console.log('📄 PDF生成を開始します...\n');

  const files = (await globby(['**/*.png'], { cwd: SRC_DIR }))
    .sort(naturalSort);

  if (files.length === 0) {
    throw new Error('スクリーンショットが見つかりません。先に `npm run capture` を実行してください。');
  }

  console.log(`   対象画像: ${files.length} 枚`);
  console.log(`   出力先: ${OUT_PDF}\n`);

  fs.mkdirSync(path.dirname(OUT_PDF), { recursive: true });
  const doc = new PDFDocument({ autoFirstPage: false });

  const stream = fs.createWriteStream(OUT_PDF);
  doc.pipe(stream);

  let processedCount = 0;

  for (const rel of files) {
    const imagePath = path.join(SRC_DIR, rel);

    try {
      console.log(`   → ${rel}`);

      const { width: imgW, height: imgH } = getImageSize(imagePath);

      // A4 縦基準
      const pageW = 595.28; // pt
      const pageH = 841.89; // pt
      const margin = 28;
      const captionH = 28;

      // 画像を収める矩形
      const boxW = pageW - margin * 2;
      const boxH = pageH - margin * 2 - captionH;

      // スケール計算
      const scale = Math.min(boxW / imgW, boxH / imgH);
      const drawW = imgW * scale;
      const drawH = imgH * scale;
      const x = (pageW - drawW) / 2;
      const y = margin;

      doc.addPage({ size: 'A4', margin: 0 });
      doc.image(imagePath, x, y, { width: drawW, height: drawH });

      // キャプション
      doc.fontSize(10)
        .fillColor('#333')
        .text(rel.replace(/\.(png|jpg)$/i, ''), margin, pageH - margin - captionH + 8, {
          width: pageW - margin * 2,
          align: 'center'
        });

      processedCount++;
    } catch (error) {
      console.error(`   ❌ エラー: ${rel} - ${error.message}`);
    }
  }

  doc.end();

  await new Promise((resolve) => stream.on('finish', resolve));

  console.log(`\n✅ PDF生成完了！ ${processedCount} ページを出力しました。`);
  console.log(`   ファイル: ${OUT_PDF}\n`);
}

makePdf().catch((e) => {
  console.error('❌ 致命的なエラーが発生しました:', e.message);
  process.exit(1);
});
