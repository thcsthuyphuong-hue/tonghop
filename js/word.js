// Xử lý Word: tạo mẫu DOCX và phân tích ngân hàng câu hỏi DOCX.
// Logic bên trong được giữ nguyên, chỉ chuyển ra khỏi file chính.
// Cấu trúc Word giữ nguyên các trường dữ liệu của mẫu Excel cũ:
// MCQ: CauHoi, DapAnDung, PhuongAn1-4, GiaiThich
// TF: NguCanh, Y_A-D, DapAn_A-D, GiaiThich
// SHORT: CauHoi, DapAn, GiaiThich
const WORD_TEMPLATE_VERSION = '1.0';

export const wordXmlEscape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* ===================== TẠO FILE WORD MẪU - KHÔNG DÙNG CDN =====================
   .docx là một ZIP chứa các XML của Word. Phần này tạo ZIP dạng Store (không nén)
   trực tiếp bằng Web APIs, nên nút TẢI FILE WORD MẪU không phụ thuộc Internet.
*/


const wordRunXml = (text, options = {}) => {
    const safe = wordXmlEscape(text);
    const rPr = [];
    if (options.bold) rPr.push('<w:b/>');
    if (options.italics) rPr.push('<w:i/>');
    if (options.size) rPr.push(`<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>`);
    return `<w:r>${rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${safe}</w:t></w:r>`;
};

const wordParagraphXml = (text = '', options = {}) => {
    const pPr = [];
    if (options.heading) pPr.push(`<w:pStyle w:val="${options.heading}"/>`);
    if (options.after != null) pPr.push(`<w:spacing w:after="${options.after}"/>`);
    if (options.align) pPr.push(`<w:jc w:val="${options.align}"/>`);
    const runs = Array.isArray(text)
        ? text.map(x => wordRunXml(x.text, x)).join('')
        : wordRunXml(text, options);
    return `<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}${runs}</w:p>`;
};

const wordQuestionXml = (title, bodyLines, answer, explanation) => {
    let out = '';
    out += wordParagraphXml(title, { bold: true, after: 100 });
    bodyLines.forEach(line => { out += wordParagraphXml(line, { after: 60 }); });
    out += wordParagraphXml(`Đáp án: ${answer}`, { bold: true, after: 60 });
    out += wordParagraphXml(`Giải thích: ${explanation}`, { after: 160 });
    return out;
};

const crc32Table = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
    }
    return table;
})();

const wordCrc32 = (bytes) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crc32Table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
};

const wordU16 = (n) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF]);
const wordU32 = (n) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]);
const wordConcat = (parts) => {
    const total = parts.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach(a => { out.set(a, offset); offset += a.length; });
    return out;
};

const createStoredZip = (entries) => {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    entries.forEach(entry => {
        const nameBytes = encoder.encode(entry.name);
        const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
        const crc = wordCrc32(data);
        if (nameBytes.length > 0xFFFF || data.length > 0xFFFFFFFF) {
            throw new Error(`WORD-E03: Dữ liệu "${entry.name}" vượt giới hạn ZIP.`);
        }

        const local = wordConcat([
            new Uint8Array([0x50,0x4B,0x03,0x04]),
            wordU16(20), wordU16(0), wordU16(0), wordU16(0), wordU16(0),
            wordU32(crc), wordU32(data.length), wordU32(data.length),
            wordU16(nameBytes.length), wordU16(0), nameBytes, data
        ]);
        localParts.push(local);

        const central = wordConcat([
            new Uint8Array([0x50,0x4B,0x01,0x02]),
            wordU16(20), wordU16(20), wordU16(0), wordU16(0), wordU16(0), wordU16(0),
            wordU32(crc), wordU32(data.length), wordU32(data.length),
            wordU16(nameBytes.length), wordU16(0), wordU16(0), wordU16(0), wordU16(0),
            wordU32(0), wordU32(offset), nameBytes
        ]);
        centralParts.push(central);
        offset += local.length;
    });

    const centralOffset = offset;
    const centralSize = centralParts.reduce((sum, a) => sum + a.length, 0);
    const count = entries.length;
    if (count > 0xFFFF || centralOffset > 0xFFFFFFFF || centralSize > 0xFFFFFFFF) {
        throw new Error('WORD-E03: ZIP vượt giới hạn định dạng DOCX.');
    }

    const eocd = wordConcat([
        new Uint8Array([0x50,0x4B,0x05,0x06]),
        wordU16(0), wordU16(0), wordU16(count), wordU16(count),
        wordU32(centralSize), wordU32(centralOffset), wordU16(0)
    ]);
    return new Blob([...localParts, ...centralParts, eocd], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
};

export const buildWordTemplateBlob = () => {
    if (typeof Blob === 'undefined' || typeof TextEncoder === 'undefined') {
        throw new Error('WORD-E01: Trình duyệt không hỗ trợ Blob/TextEncoder cần thiết để tạo file Word.');
    }

    const body = [];
    body.push(wordParagraphXml('MẪU NGÂN HÀNG ĐỀ VẬT LÝ 9', { bold: true, size: 32, align: 'center', after: 180 }));
    body.push(wordParagraphXml(`Phiên bản mẫu: ${WORD_TEMPLATE_VERSION}`, { italics: true, align: 'center', after: 120 }));
    body.push(wordParagraphXml('HƯỚNG DẪN: Không đổi tên các tiêu đề PHẦN. Mỗi câu bắt đầu bằng "Câu ...". Giữ đúng dòng "Đáp án:" và "Giải thích:".', { bold: true, after: 160 }));

    body.push(wordParagraphXml('PHẦN I - TRẮC NGHIỆM', { bold: true, size: 28, after: 120 }));
    body.push(wordQuestionXml('Câu 1. Công thức tính điện trở dây dẫn hình trụ là:', [
        'A. R = ρ l/S', 'B. R = l/(ρS)', 'C. R = ρ S/l', 'D. R = S/(ρl)'
    ], 'A', 'Điện trở tỉ lệ thuận với chiều dài l, tỉ lệ nghịch với tiết diện S.'));

    body.push(wordParagraphXml('PHẦN II - ĐÚNG / SAI', { bold: true, size: 28, after: 120 }));
    body.push(wordQuestionXml('Câu 1. Cho đoạn mạch nối tiếp:', [
        'a) Dòng điện luôn bằng nhau ở mọi điểm — Đúng',
        'b) Hiệu điện thế bằng nhau ở mọi điểm — Sai',
        'c) Điện trở tương đương bằng tổng các điện trở — Đúng',
        'd) Khi tăng 1 điện trở thì dòng mạch tăng — Sai'
    ], 'Đ, S, Đ, S', 'Mạch nối tiếp có I bằng nhau, U bằng tổng, R bằng tổng.'));

    body.push(wordParagraphXml('PHẦN III - TRẢ LỜI NGẮN', { bold: true, size: 28, after: 120 }));
    body.push(wordQuestionXml('Câu 1. Bếp điện có điện trở 80 Ω, cường độ dòng điện 2,5 A. Tính U?', [], '200', 'U = I × R = 2,5 × 80 = 200 V.'));

    body.push(wordParagraphXml('LƯU Ý KÝ HIỆU', { bold: true, size: 28, after: 120 }));
    body.push(wordParagraphXml('Bạn có thể gõ hoặc dán trực tiếp các ký hiệu như m³, m², Ω, Δ, ρ, μ và công thức. Không cần dùng ký tự ô vuông.', { after: 100 }));

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex" xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml" xmlns:w16du="http://schemas.microsoft.com/office/word/2023/wordml" xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2024/wordml/sdtdatahash" xmlns:w16sdtfl="http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock" xmlns:w16wml="http://schemas.microsoft.com/office/word/2024/wordml" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 w16cex w16cid w16 w16du w16sdtdh w16sdtfl w16wml">\n<w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Mẫu Ngân Hàng Đề Vật Lý 9</dc:title><dc:creator>Hệ thống luyện tập</dc:creator><cp:lastModifiedBy>Hệ thống luyện tập</cp:lastModifiedBy></cp:coreProperties>`;
    const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Web Question Bank</Application></Properties>`;

    const blob = createStoredZip([
        { name: '[Content_Types].xml', data: contentTypes },
        { name: '_rels/.rels', data: rootRels },
        { name: 'word/document.xml', data: documentXml },
        { name: 'word/styles.xml', data: styles },
        { name: 'word/_rels/document.xml.rels', data: docRels },
        { name: 'docProps/core.xml', data: core },
        { name: 'docProps/app.xml', data: app }
    ]);
    if (!blob || blob.size < 1000) throw new Error(`WORD-E04: File DOCX tạo ra quá nhỏ (${blob?.size || 0} bytes).`);
    return blob;
};

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="word-root">${html}</div>`, 'text/html');
    const root = doc.getElementById('word-root');
    const supMap = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ' };
    root.querySelectorAll('sup').forEach(el => { el.replaceWith([...el.textContent].map(ch => supMap[ch] || ch).join('')); });
    root.querySelectorAll('sub').forEach(el => {
        const subMap = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ' };
        el.replaceWith([...el.textContent].map(ch => subMap[ch] || ch).join(''));
    });
    return root.innerHTML.trim();
};

const wordBlockText = (node) => normalizeWordHtml(node?.innerHTML || '').replace(/\u00a0/g, ' ').replace(/\s+$/g, '').trim();
const cleanLine = (value) => String(value || '').replace(/^[\uFEFF\u200B\u200C\u200D]+/, '').trim();
const stripQuestionPrefix = (value) => cleanLine(value).replace(/^Câu\s*\d+\s*[:.\-]\s*/i, '').trim();
const stripOptionPrefix = (value) => cleanLine(value).replace(/^[A-D]\s*[.)\-:]\s*/i, '').trim();
const stripTfPrefix = (value) => cleanLine(value).replace(/^[a-d]\s*[.)\-:]\s*/i, '').trim();
const parseBool = (value) => /^(true|đúng|d|t|1|yes)$/i.test(cleanLine(value));

const parseWordQuestionNumber = (text) => /^Câu\s*\d+\s*[:.\-]?/i.test(cleanLine(text));
const getWordParagraphs = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="word-root">${html}</div>`, 'text/html');
    const root = doc.getElementById('word-root');
    const nodes = [...root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6')];
    if (nodes.length === 0) return [root];
    return nodes.map(n => ({ el: n, text: cleanLine(wordBlockText(n)), html: wordBlockText(n) })).filter(x => x.text);
};

export const parseWordQuestionBank = async (arrayBuffer) => {
    if (!window.mammoth) throw new Error('Thư viện đọc Word chưa tải xong.');
    const result = await mammoth.convertToHtml({ arrayBuffer }, {
        styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh"
        ]
    });
    const blocks = getWordParagraphs(result.value);
    const sections = { mcq: [], tf: [], short: [] };
    let section = '';
    let current = null;

    const finish = () => {
        if (!current) return;
        if (section === 'mcq') {
            if (current.q && current.o.length >= 2 && current.a) sections.mcq.push(current);
        } else if (section === 'tf') {
            if (current.ctx && current.sts.length === 4 && current.sts.every(x => typeof x.a === 'boolean')) sections.tf.push(current);
        } else if (section === 'short') {
            if (current.q && current.a !== '') sections.short.push(current);
        }
        current = null;
    };

    const startQuestion = (raw) => {
        finish();
        const qText = stripQuestionPrefix(raw);
        current = section === 'mcq'
            ? { q: qText, a: '', o: [], e: '' }
            : section === 'tf'
                ? { ctx: qText, sts: [], e: '' }
                : { q: qText, a: '', e: '' };
    };

    for (let i = 0; i < blocks.length; i++) {
        const text = blocks[i].text;
        const lower = text.toLowerCase();
        if (/^phần\s*i\s*[-–—:]?\s*trắc nghiệm/i.test(text)) { finish(); section = 'mcq'; continue; }
        if (/^phần\s*ii\s*[-–—:]?\s*đúng\s*[/\\-]?\s*sai/i.test(text)) { finish(); section = 'tf'; continue; }
        if (/^phần\s*iii\s*[-–—:]?\s*trả\s*lời\s*ngắn/i.test(text)) { finish(); section = 'short'; continue; }
        if (!section) continue;

        if (parseWordQuestionNumber(text)) { startQuestion(text); continue; }
        if (!current) continue;

        if (section === 'mcq') {
            const opt = text.match(/^([A-D])\s*[.)\-:]\s*(.+)$/i);
            if (opt) { current.o.push(stripOptionPrefix(text)); continue; }
            const ans = text.match(/^Đáp\s*án\s*:\s*(.+)$/i);
            if (ans) {
                const val = cleanLine(ans[1]);
                current.a = val.length === 1 ? val.toUpperCase() : val.replace(/^[A-D]\s*[.)\-:]\s*/i, '').trim();
                if (/^[A-D]$/i.test(current.a)) {
                    current.a = current.a.toUpperCase();
                    const idx = current.a.charCodeAt(0) - 65;
                    current.a = current.o[idx] || current.a;
                }
                continue;
            }
            const exp = text.match(/^Giải\s*thích\s*:\s*(.*)$/i);
            if (exp) { current.e = cleanLine(exp[1]); continue; }
        } else if (section === 'tf') {
            const tf = text.match(/^([a-d])\s*[.)\-:]\s*(.+)$/i);
            if (tf) {
                const raw = tf[2];
                const inline = raw.match(/^(.*?)(?:\s*[—-]\s*|\s*\|\s*)(Đúng|Sai)$/i);
                if (inline) current.sts.push({ l: tf[1].toLowerCase() + ')', t: cleanLine(inline[1]), a: parseBool(inline[2]) });
                else current.sts.push({ l: tf[1].toLowerCase() + ')', t: cleanLine(raw), a: undefined });
                continue;
            }
            const ans = text.match(/^Đáp\s*án\s*:\s*(.+)$/i);
            if (ans) {
                const vals = ans[1].split(/[,;|\s]+/).filter(Boolean);
                current.sts.forEach((st, idx) => { if (vals[idx]) st.a = parseBool(vals[idx]); });
                continue;
            }
            const exp = text.match(/^Giải\s*thích\s*:\s*(.*)$/i);
            if (exp) { current.e = cleanLine(exp[1]); continue; }
        } else if (section === 'short') {
            const ans = text.match(/^Đáp\s*án\s*:\s*(.*)$/i);
            if (ans) { current.a = cleanLine(ans[1]); continue; }
            const exp = text.match(/^Giải\s*thích\s*:\s*(.*)$/i);
            if (exp) { current.e = cleanLine(exp[1]); continue; }
        }
    }
    finish();
    return sections;
};

