/**
 * 造一个最小但**结构合法**的 EPUB（ZIP store 模式，不压缩）。
 *
 * 用作导入链路的测试样本：真实样本比 mock 值钱——它会把"中央目录偏移算错"
 * 这类错误暴露出来，而 mock 的 `listEntries` 永远不会。
 *
 * store 模式（method=0）让夹具的字节可预测，也顺便验证解析器对未压缩条目的处理。
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface FakeEntry {
  name: string;
  data: Uint8Array;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function buildZip(entries: FakeEntry[]): ArrayBuffer {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = utf8(e.name);
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // method = store
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    locals.push(local, e.data);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true); // store
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length + e.data.length;
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + cdSize + eocd.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, at);
    at += part.length;
  }
  return out.buffer;
}

export interface EpubSpec {
  title?: string;
  author?: string;
  language?: string;
  chapters: ReadonlyArray<{ title?: string; paragraphs: readonly string[] }>;
  /** 加上 META-INF/encryption.xml；'font' 表示字体混淆，'drm' 表示真 DRM */
  encryption?: 'font' | 'drm';
  /** 固定版式声明 */
  prePaginated?: boolean;
  cover?: boolean;
}

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

export function buildEpub(spec: EpubSpec): ArrayBuffer {
  const chapters = spec.chapters.map((c, i) => ({
    id: `ch${i + 1}`,
    href: `Text/ch${i + 1}.xhtml`,
    title: c.title ?? `第 ${i + 1} 章`,
    body: c.paragraphs.map((p) => `<p>${p}</p>`).join('\n'),
  }));

  const manifest = chapters
    .map((c) => `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`)
    .join('\n    ');
  const spine = chapters.map((c) => `<itemref idref="${c.id}"/>`).join('\n    ');
  const metas = [
    spec.prePaginated ? '<meta property="rendition:layout">pre-paginated</meta>' : '',
    spec.cover ? '<meta name="cover" content="cover-img"/>' : '',
  ]
    .filter(Boolean)
    .join('\n    ');

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${spec.title ?? '测试书'}</dc:title>
    <dc:creator>${spec.author ?? '测试作者'}</dc:creator>
    <dc:language>${spec.language ?? 'zh-CN'}</dc:language>
    ${metas}
  </metadata>
  <manifest>
    ${manifest}
    ${spec.cover ? '<item id="cover-img" href="Images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>' : ''}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`;

  const entries: FakeEntry[] = [
    { name: 'mimetype', data: utf8('application/epub+zip') },
    { name: 'META-INF/container.xml', data: utf8(CONTAINER) },
    { name: 'OEBPS/content.opf', data: utf8(opf) },
    ...chapters.map((c) => ({
      name: `OEBPS/${c.href}`,
      data: utf8(
        `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${c.title}</title>
<style>p{color:#ff0000}</style></head><body>
<h1>${c.title}</h1>
${c.body}
<script>alert(1)</script>
</body></html>`,
      ),
    })),
  ];

  if (spec.cover) {
    // 一个 1x1 的 JPEG 头（内容不重要，解析器只取字节与 mime）
    entries.push({ name: 'OEBPS/Images/cover.jpg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) });
  }
  if (spec.encryption === 'font') {
    entries.push({
      name: 'META-INF/encryption.xml',
      data: utf8(
        `<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
        <CipherData><CipherReference URI="OEBPS/fonts/a.ttf"/></CipherData></EncryptedData></encryption>`,
      ),
    });
  }
  if (spec.encryption === 'drm') {
    entries.push({
      name: 'META-INF/encryption.xml',
      data: utf8(
        `<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>
        <CipherData><CipherReference URI="OEBPS/Text/ch1.xhtml"/></CipherData></EncryptedData></encryption>`,
      ),
    });
  }

  return buildZip(entries);
}
