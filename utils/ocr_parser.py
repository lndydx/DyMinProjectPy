import re
import numpy as np
import pandas as pd
import easyocr

_ocr_model = None

def get_ocr_model():
    global _ocr_model
    if _ocr_model is None:
        _ocr_model = easyocr.Reader(['en', 'id'], verbose=False)
    return _ocr_model

NAMA_RUANGAN = [
    'kamar', 'tidur', 'tamu', 'keluarga', 'duduk', 'santai',
    'dapur', 'makan', 'pantry', 'kitchen', 'dining',
    'mandi', 'wc', 'toilet', 'km', 'lavatory', 'bathroom', 'restroom',
    'garasi', 'carport', 'parkir', 'car port',
    'teras', 'balkon', 'selasar', 'beranda', 'porch',
    'gudang', 'storage', 'utility', 'janitor', 'pompa', 'panel',
    'mushola', 'musholla', 'musola', 'masjid', 'sholat',
    'ruang', 'koridor', 'tangga', 'void', 'lobby', 'foyer',
    'hall', 'entrance', 'lift', 'elevator',
    'kantor', 'office', 'rapat', 'meeting', 'resepsionis', 'reception',
    'lounge', 'ruang tunggu', 'kasir',
    'kelas', 'lab', 'laboratorium', 'perpustakaan', 'uks',
    'laundry', 'cuci', 'jemur',
    
    'kainar', 'karnar', 'tiduf', 'temu', 'kelurga',
    'daour', 'dapor', 'wc.', 'toliet', 'toiet',
    'balkoni', 'teraas', 'gudan',
    'mushala', 'musolla',
]

_KOREKSI_OCR = {
    'kainar'  : 'kamar',    'karnar'  : 'kamar',    'kamer'    : 'kamar',
    'tiduf'   : 'tidur',
    'temu'    : 'tamu',
    'kelurga' : 'keluarga', 'kelaurga': 'keluarga',
    'daour'   : 'dapur',    'dapor'   : 'dapur',
    'toliet'  : 'toilet',   'toiet'   : 'toilet',
    'wc.'     : 'wc',
    'gudan'   : 'gudang',
    'musala'  : 'mushola',  'mushalla': 'mushola',
    'musolla' : 'mushola',
    'balkoni' : 'balkon',
    'teraas'  : 'teras',
    'car port': 'carport',
}

_NOISE_CHAR = str.maketrans({
    'O': '0', 'o': '0',
    'l': '1', 'I': '1',
    'S': '5',
    'Z': '2',
    'B': '8',
})

POLA_DIMENSI = re.compile(
    r'(\d{1,3}[.,]?\d{0,2})\s*[xX×]\s*(\d{1,3}[.,]?\d{0,2})'
)

_BLACKLIST_DIMENSI = re.compile(
    r'(\+|-)\d+[\.,]\d+|'       
    r'FFL|'                     
    r'\d{3,4}x\d{3,4}mm|'       
    r'1:\d+',                    
    re.IGNORECASE
)

# Normalisasi 

def koreksi_noise_angka(teks):
    tokens = teks.split()
    hasil  = []
    for tok in tokens:
        digit_ratio = sum(c.isdigit() for c in tok) / max(len(tok), 1)
        if digit_ratio >= 0.4:
            tok = tok.translate(_NOISE_CHAR)
        hasil.append(tok)
    return ' '.join(hasil)

def normalisasi_teks_ocr(teks):
    teks = teks.replace(',', '.')
    teks = re.sub(r'(\d)\s+\.\s*(\d)', r'\1.\2', teks)
    teks = re.sub(r'(\d)\s*\.\s+(\d)', r'\1.\2', teks)
    teks = koreksi_noise_angka(teks)
    return teks.strip()

def normalisasi_nama_ruangan(teks):
    teks = re.sub(r'[|_\\\n\r]', ' ', teks)
    teks = re.sub(r'\s+', ' ', teks).strip()
    teks = re.sub(r'(?<=[a-zA-Z])\d+', '', teks)

    teks = re.sub(r'(ruang)(tamu|makan|keluarga|tidur|rapat|tunggu)',
                  r'\1 \2', teks, flags=re.IGNORECASE)
    teks = re.sub(r'(kamar)(tidur|mandi)',
                  r'\1 \2', teks, flags=re.IGNORECASE)

    teks = re.sub(r'^[^a-zA-Z]*', '', teks)

    teks_lower = teks.lower()
    for salah, benar in _KOREKSI_OCR.items():
        teks_lower = teks_lower.replace(salah, benar)
    return teks_lower


# Parsing dimensi 

def parse_dimensi(teks):
    if _BLACKLIST_DIMENSI.search(teks):
        return None

    teks_normal = normalisasi_teks_ocr(teks)
    match = POLA_DIMENSI.search(teks_normal)
    if not match:
        return None

    try:
        p = float(match.group(1))
        l = float(match.group(2))
    except ValueError:
        return None

    p = p / 100 if p > 50 else p
    l = l / 100 if l > 50 else l

    if not (0.5 <= p <= 30 and 0.5 <= l <= 30):
        return None

    return round(p, 2), round(l, 2)

def coba_gabung_token(row, df_sorted, i, dy_max=150, dx_max=500):
    for j, row2 in df_sorted.iterrows():
        if i == j:
            continue
        dy = abs(row['y'] - row2['y'])
        dx = abs(row['x'] - row2['x'])
        if dy > dy_max:
            continue
        if dx > dx_max:
            continue
        for sep in [' x ', 'x', ' X ', 'X', '×']:
            gabungan = row['teks'] + sep + row2['teks']
            dim = parse_dimensi(gabungan)
            if dim:
                return dim
    return None

def baca_gambar(image_path, conf_threshold=0.15):
    model = get_ocr_model()
    hasil = model.readtext(image_path, detail=1)

    teks_list = []
    for (box, teks, conf) in hasil:
        if conf < conf_threshold:
            continue
        teks = teks.strip()
        if not teks:
            continue
        x = np.mean([p[0] for p in box])
        y = np.mean([p[1] for p in box])
        teks_list.append({
            'teks': teks,
            'x'   : x,
            'y'   : y,
            'conf': round(conf, 3),
        })

    return pd.DataFrame(teks_list)

def parse_teks_ocr(df_teks):
    if df_teks.empty:
        return (
            pd.DataFrame(columns=['nama', 'x', 'y']),
            pd.DataFrame(columns=['x', 'y', 'p', 'l']),
        )

    ruangan, dimensi_list = [], []
    dimensi_set = set()   
    df_sorted = df_teks.sort_values('y').reset_index(drop=True)

    for i, row in df_sorted.iterrows():
        teks_asli  = row['teks']
        teks_lower = normalisasi_nama_ruangan(teks_asli)

        if any(n in teks_lower for n in NAMA_RUANGAN):
            ruangan.append({'nama': teks_asli, 'x': row['x'], 'y': row['y']})

        dim = parse_dimensi(teks_asli)
        if dim:
            key = (round(row['x']), round(row['y']))
            if key not in dimensi_set:
                dimensi_set.add(key)
                dimensi_list.append({
                    'x': row['x'], 'y': row['y'],
                    'p': dim[0],   'l': dim[1],
                })
            continue

        dim = coba_gabung_token(row, df_sorted, i, dy_max=150, dx_max=500)
        if dim:
            key = (round(row['x']), round(row['y']))
            if key not in dimensi_set:
                dimensi_set.add(key)
                dimensi_list.append({
                    'x': row['x'], 'y': row['y'],
                    'p': dim[0],   'l': dim[1],
                })

    return pd.DataFrame(ruangan), pd.DataFrame(dimensi_list)

def pasangkan_ocr(df_ruangan, df_dimensi, maks_jarak=None, ukuran_gambar=None):
    if df_ruangan.empty:
        return pd.DataFrame(columns=['nama', 'panjang', 'lebar', 'luas'])

    if maks_jarak is None:
        if ukuran_gambar is not None:
            w, h       = ukuran_gambar
            diagonal   = np.sqrt(w**2 + h**2)
            maks_jarak = diagonal * 0.20
        else:
            maks_jarak = 300

    hasil   = []
    dipakai = set()

    for _, r in df_ruangan.iterrows():
        if df_dimensi.empty:
            hasil.append({'nama': r['nama'], 'panjang': None, 'lebar': None, 'luas': None})
            continue

        df_dim_copy = df_dimensi.copy()
        df_dim_copy['jarak'] = np.sqrt(
            (df_dim_copy['x'] - r['x'])**2 +
            (df_dim_copy['y'] - r['y'])**2
        )

        df_dim_sorted = df_dim_copy.sort_values('jarak')
        matched = False

        for idx, near in df_dim_sorted.iterrows():
            if idx in dipakai:
                continue
            if near['jarak'] <= maks_jarak:
                dipakai.add(idx)
                hasil.append({
                    'nama'   : r['nama'],
                    'panjang': near['p'],
                    'lebar'  : near['l'],
                    'luas'   : round(near['p'] * near['l'], 2),
                })
                matched = True
                break

        if not matched:
            hasil.append({'nama': r['nama'], 'panjang': None, 'lebar': None, 'luas': None})

    df_hasil = pd.DataFrame(hasil)
    if not df_hasil.empty and df_hasil['nama'].duplicated().any():
        df_hasil = (
            df_hasil
            .sort_values('luas', ascending=False)
            .drop_duplicates(subset='nama', keep='first')
            .reset_index(drop=True)
        )

    return df_hasil


def parse_image(image_path, maks_jarak=None, conf_threshold=0.15):
    import cv2
    df_teks = baca_gambar(image_path, conf_threshold=conf_threshold)
    if df_teks.empty:
        return pd.DataFrame(columns=['nama', 'panjang', 'lebar', 'luas']), 0

    img = cv2.imread(image_path)
    if img is not None:
        h, w          = img.shape[:2]
        ukuran_gambar = (w, h)
    else:
        ukuran_gambar = None

    df_r, df_d = parse_teks_ocr(df_teks)

    if df_r.empty:
        return pd.DataFrame(columns=['nama', 'panjang', 'lebar', 'luas']), len(df_teks)

    df_ruangan = pasangkan_ocr(df_r, df_d, maks_jarak=maks_jarak, ukuran_gambar=ukuran_gambar)
    return df_ruangan, len(df_teks)