import pandas as pd
import numpy as np
import ezdxf
import re

def load_hspk(path):
    return pd.read_csv(path)

def load_upah(path):
    return pd.read_csv(path)

def get_harga(df_hspk, keyword, kategori=None):
    mask = df_hspk['uraian'].str.contains(keyword, case=False, na=False)
    if kategori:
        mask = mask & (df_hspk['kategori'] == kategori)
    hasil = df_hspk[mask]
    if hasil.empty:
        return 0, '-', '-'
    row = hasil.iloc[0]
    return int(row['harga_satuan']), row['satuan'], row['uraian']

def build_harga_map(df_hspk, spesifikasi):
    harga_map = {}
    for pekerjaan, (kw, kat) in spesifikasi.items():
        harga, sat, uraian = get_harga(df_hspk, kw, kat)
        harga_map[pekerjaan] = {'harga': harga, 'satuan': sat, 'uraian': uraian}
    return harga_map

NAMA_RUANGAN = [
    'kamar','tidur','tamu','keluarga','dapur','makan','mandi','wc',
    'toilet','km','garasi','carport','teras','balkon','gudang',
    'mushola','ruang','koridor','tangga','void','pantry','lavatory'
]
POLA_DIMENSI = re.compile(r'(\d+[\.,]?\d*)\s*[xX×]\s*(\d+[\.,]?\d*)')

def ekstrak_teks(msp):
    teks_list = []
    for entity in msp:
        if entity.dxftype() == 'TEXT':
            teks_list.append({
                'teks': entity.dxf.text.strip(),
                'x'   : entity.dxf.insert.x,
                'y'   : entity.dxf.insert.y,
            })
        elif entity.dxftype() == 'MTEXT':
            try:
                teks = entity.plain_text()
            except AttributeError:
                teks = entity.dxf.text if hasattr(entity.dxf, 'text') else ''
            teks = re.sub(r'\{[^}]*\}', '', teks)
            teks = re.sub(r'\\[A-Za-z][^;]*;', '', teks).strip()
            if not teks:
                continue
            teks_list.append({
                'teks': teks,
                'x'   : entity.dxf.insert.x,
                'y'   : entity.dxf.insert.y,
            })
    return pd.DataFrame(teks_list)

def ekstrak_garis(msp):
    garis_list = []
    for entity in msp:
        if entity.dxftype() == 'LINE':
            garis_list.append({
                'x1': entity.dxf.start.x, 'y1': entity.dxf.start.y,
                'x2': entity.dxf.end.x,   'y2': entity.dxf.end.y,
            })
        elif entity.dxftype() == 'LWPOLYLINE':
            pts = list(entity.get_points())
            for i in range(len(pts) - 1):
                garis_list.append({
                    'x1': pts[i][0],   'y1': pts[i][1],
                    'x2': pts[i+1][0], 'y2': pts[i+1][1],
                })
    return pd.DataFrame(garis_list)

def parse_ruangan(df_teks):
    ruangan, dimensi_list = [], []
    for _, row in df_teks.iterrows():
        teks = row['teks'].lower()
        if any(n in teks for n in NAMA_RUANGAN):
            ruangan.append({'nama': row['teks'], 'x': row['x'], 'y': row['y']})
        match = POLA_DIMENSI.search(row['teks'])
        if match:
            p = float(match.group(1).replace(',', '.'))
            l = float(match.group(2).replace(',', '.'))
            dimensi_list.append({'x': row['x'], 'y': row['y'], 'p': p, 'l': l})
    return pd.DataFrame(ruangan), pd.DataFrame(dimensi_list)

def pasangkan(df_ruangan, df_dimensi, maks_jarak=500):
    hasil = []
    for _, r in df_ruangan.iterrows():
        if df_dimensi.empty:
            hasil.append({'nama': r['nama'], 'panjang': None, 'lebar': None, 'luas': None})
            continue
        df_dimensi = df_dimensi.copy()
        df_dimensi['jarak'] = np.sqrt(
            (df_dimensi['x'] - r['x'])**2 + (df_dimensi['y'] - r['y'])**2
        )
        near = df_dimensi.loc[df_dimensi['jarak'].idxmin()]
        if near['jarak'] <= maks_jarak:
            p = near['p'] / 100 if near['p'] > 50 else near['p']
            l = near['l'] / 100 if near['l'] > 50 else near['l']
            hasil.append({'nama': r['nama'], 'panjang': p, 'lebar': l, 'luas': round(p*l, 2)})
        else:
            hasil.append({'nama': r['nama'], 'panjang': None, 'lebar': None, 'luas': None})
    return pd.DataFrame(hasil)

def parse_dxf(filepath, maks_jarak=500):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    df_teks   = ekstrak_teks(msp)
    df_garis  = ekstrak_garis(msp)
    df_r, df_d = parse_ruangan(df_teks)
    df_ruangan = pasangkan(df_r, df_d, maks_jarak)
    return df_ruangan, df_garis, len(df_teks)

# CALCULATOR RAB
def hitung_rab(df_ruangan, harga_map, tinggi_dinding, faktor_bukaan, df_upah):
    rows = []

    def get_upah_hari(jabatan):
        mask = (df_upah['uraian'].str.contains(jabatan, case=False)) & (df_upah['satuan'] == 'Orang/Hari')
        res = df_upah[mask]
        return res.iloc[0]['harga_satuan'] if not res.empty else 0

    upah_pekerja = get_upah_hari('Pekerja')
    upah_tukang  = get_upah_hari('Tukang')
    upah_mandor  = get_upah_hari('Mandor')

    df_valid = df_ruangan[
        df_ruangan['panjang'].notna() &
        df_ruangan['lebar'].notna() &
        (df_ruangan['panjang'] > 0) &
        (df_ruangan['lebar'] > 0)
    ].copy()

    for _, ruangan in df_valid.iterrows():
        p, l, luas = ruangan['panjang'], ruangan['lebar'], ruangan['luas']
        keliling = 2 * (p + l)
        vol = {
            'lantai_keramik': round(luas, 2),
            'dinding_bata'  : round(keliling * tinggi_dinding * (1 - faktor_bukaan), 2),
            'plesteran'     : round(keliling * tinggi_dinding * (1 - faktor_bukaan) * 2, 2),
            'cat_dinding'   : round(keliling * tinggi_dinding * (1 - faktor_bukaan) * 2, 2),
            'plafon_gypsum' : round(luas, 2),
            'atap_genteng'  : round(luas * 1.3, 2),
            'rangka_atap'   : round(luas * 1.3, 2),
            'pondasi_beton' : round(keliling * 0.3, 2),
        }

        koef_tenaga = {
            'lantai_keramik': (0.25 * upah_tukang) + (0.3  * upah_pekerja),
            'dinding_bata'  : (0.1  * upah_tukang) + (0.3  * upah_pekerja),
            'plesteran'     : (0.15 * upah_tukang) + (0.2  * upah_pekerja),
            'cat_dinding'   : (0.06 * upah_tukang) + (0.02 * upah_pekerja),
            'plafon_gypsum' : (0.1  * upah_tukang) + (0.05 * upah_pekerja),
            'atap_genteng'  : (0.15 * upah_tukang) + (0.2  * upah_pekerja),
            'rangka_atap'   : (0.2  * upah_tukang) + (0.1  * upah_pekerja),
            'pondasi_beton' : (0.2  * upah_tukang) + (1.5  * upah_pekerja),
        }

        for pekerjaan, volume in vol.items():
            info               = harga_map.get(pekerjaan, {})
            harga_material     = info.get('harga', 0)
            harga_upah         = koef_tenaga.get(pekerjaan, 0)
            total_harga_satuan = harga_material + harga_upah

            rows.append({
                'ruangan'     : ruangan['nama'],
                'pekerjaan'   : pekerjaan,
                'volume'      : volume,
                'satuan'      : info.get('satuan', '-'),
                'harga_mat'   : harga_material,
                'harga_upah'  : round(harga_upah, 2),
                'total_satuan': round(total_harga_satuan, 2),
                'biaya_total' : round(volume * total_harga_satuan, 2),
            })

    return pd.DataFrame(rows)

def buat_rekap(df_detail, df_edit):
    df_edit_dedup = (
        df_edit
        .sort_values('luas', ascending=False)
        .drop_duplicates(subset='nama', keep='first')
        .set_index('nama')
    )

    df_rekap = df_detail.groupby('ruangan')['biaya_total'].sum().reset_index()
    df_rekap.columns = ['ruangan', 'total_biaya']
    df_rekap['luas'] = df_edit_dedup.reindex(df_rekap['ruangan'])['luas'].values

    grand_total     = df_rekap['total_biaya'].sum()
    ppn             = round(grand_total * 0.11)
    grand_total_ppn = grand_total + ppn
    
    estimate_lower = round(grand_total_ppn * 0.85)
    estimate_top  = round(grand_total_ppn * 1.20)

    return df_rekap, grand_total, ppn, grand_total_ppn, estimate_lower, estimate_top