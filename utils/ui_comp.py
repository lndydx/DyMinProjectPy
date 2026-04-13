# utils/ui_comp.py
import os
import tempfile
import pandas as pd
import streamlit as st

from utils.calculator import build_harga_map, hitung_rab, buat_rekap, parse_dxf
from utils.exporter   import to_excel, to_pdf
from utils.ocr_parser import parse_image

SPESIFIKASI = {
    'lantai_keramik': ('keramik',     'lantai'),
    'dinding_bata'  : ('bata',        'pasangan'),
    'plesteran'     : ('plester',     'material_umum'),
    'cat_dinding'   : ('cat',         'finishing'),
    'plafon_gypsum' : ('gypsumboard', 'material_umum'),
    'atap_genteng'  : ('genteng',     'atap'),
    'rangka_atap'   : ('baja ringan', 'struktur'),
    'pondasi_beton' : ('beton',       'struktur'),
}


# ── Sidebar ───────────────────────────────────────────────────────────────────
def render_sidebar(df_hspk):
    with st.sidebar:
        st.header("⚙️ Setting")
        tinggi_dinding = st.slider("Tinggi dinding (m)",            2.5,  4.0,  3.0,  0.1)
        faktor_bukaan  = st.slider("Faktor bukaan pintu/jendela",   0.05, 0.30, 0.15, 0.01)
        maks_jarak     = st.slider("Maks jarak teks-dimensi (DXF)", 100,  2000, 500,  50)

        st.divider()
        st.subheader("📋 Spesifikasi Pekerjaan")
        harga_map = build_harga_map(df_hspk, SPESIFIKASI)
        for pekerjaan, info in harga_map.items():
            st.markdown(
                f"**{pekerjaan}**  \n"
                f"<small>{info['uraian'][:40]}...</small>  \n"
                f"`Rp {info['harga']:,} / {info['satuan']}`",
                unsafe_allow_html=True
            )
            st.divider()

    return tinggi_dinding, faktor_bukaan, maks_jarak, harga_map


# ── Input ─────────────────────────────────────────────────────────────────────
def render_input(maks_jarak):
    st.subheader("📁 Upload File")
    tab1, tab2 = st.tabs(["DXF Format", "Image (JPG/JPEG/PNG)"])
    df_edit = None

    # ── Tab DXF ───────────────────────────────────────────────────────────────
    with tab1:
        uploaded_dxf = st.file_uploader("Upload file DXF", type=['dxf'], key='dxf')
        if uploaded_dxf:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.dxf') as tmp:
                tmp.write(uploaded_dxf.read())
                tmp_path = tmp.name
            try:
                with st.spinner("Mengekstrak ruangan dari DXF..."):
                    df_ruangan, df_garis, n_teks = parse_dxf(tmp_path, maks_jarak)
                st.success(f"File berhasil dibaca: {uploaded_dxf.name}")
                st.info(
                    f"Terdeteksi {len(df_ruangan)} ruangan, "
                    f"{n_teks} teks, "
                    f"{len(df_garis)} segmen garis"
                )
                st.subheader("Data Ruangan:")
                st.caption("Bisa diedit langsung jika ada yang tidak terdeteksi.")
                df_edit = st.data_editor(
                    df_ruangan[['nama', 'panjang', 'lebar', 'luas']],
                    num_rows='dynamic',
                    use_container_width=True,
                    key='editor_dxf'
                )
            except Exception as e:
                st.error(f"Error membaca file DXF: {e}")
            finally:
                os.unlink(tmp_path)
        else:
            st.info("Upload file DXF untuk memulai.")

    # ── Tab Image ─────────────────────────────────────────────────────────────
    with tab2:
        st.caption("Upload foto atau scan denah. Nama ruangan dideteksi otomatis via OCR.")
        uploaded_img = st.file_uploader(
            "Upload gambar denah", type=['jpg', 'jpeg', 'png'], key='img'
        )
        if uploaded_img:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp:
                tmp.write(uploaded_img.read())
                tmp_path = tmp.name
            try:
                st.image(uploaded_img, caption="Preview gambar", use_column_width=True)
                with st.spinner("Membaca nama ruangan dari gambar (OCR)..."):
                    df_ruangan, n_teks = parse_image(tmp_path, maks_jarak)
                st.success(f"OCR selesai — {n_teks} teks terdeteksi")

                if df_ruangan.empty:
                    st.warning("Tidak ada ruangan terdeteksi.")
                    df_ruangan = pd.DataFrame(columns=['nama', 'panjang', 'lebar', 'luas'])

                # Dimensi yang tidak terdeteksi diisi 0
                df_ruangan['panjang'] = df_ruangan['panjang'].fillna(0)
                df_ruangan['lebar']   = df_ruangan['lebar'].fillna(0)
                df_ruangan['luas']    = df_ruangan['luas'].fillna(0)

                st.subheader("Data Ruangan:")
                st.caption("Hasil deteksi otomatis dari gambar.")
                df_edit = st.data_editor(
                    df_ruangan[['nama', 'panjang', 'lebar', 'luas']],
                    num_rows='dynamic',
                    use_container_width=True,
                    key='editor_img'
                )
            except Exception as e:
                st.error(f"Error OCR: {e}")
            finally:
                os.unlink(tmp_path)
        else:
            st.info("Upload gambar denah untuk memulai.")

    return df_edit


# ── Hasil ─────────────────────────────────────────────────────────────────────
def render_hasil(df_detail, df_rekap, grand_total, ppn,
                 grand_total_ppn, estimasi_bawah, estimasi_atas):

    st.subheader("📊 Rencana Anggaran Biaya")

    # ── Metric cards ──────────────────────────────────────────────────────────
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Ruangan",     len(df_rekap))
    col2.metric("Subtotal",          f"Rp {int(grand_total):,}".replace(',', '.'))
    col3.metric("PPN 11%",           f"Rp {int(ppn):,}".replace(',', '.'))
    col4.metric("Grand Total + PPN", f"Rp {int(grand_total_ppn):,}".replace(',', '.'))

    # ── Estimasi range ────────────────────────────────────────────────────────
    st.info(
        f"📐 **Rentang Estimasi AACE Class 4** (−15% / +20%)  \n"
        f"**Rp {int(estimasi_bawah):,}  –  Rp {int(estimasi_atas):,}**".replace(',', '.') +
        f"  \n*Estimasi awal tahap perencanaan, bukan angka kontrak.*"
    )

    # ── Detail RAB ────────────────────────────────────────────────────────────
    st.subheader("Detail RAB per Ruangan")
    st.dataframe(
        df_detail.style
            .format({
                'volume'      : '{:,.2f}',
                'harga_mat'   : 'Rp {:,.0f}',
                'harga_upah'  : 'Rp {:,.0f}',
                'total_satuan': 'Rp {:,.0f}',
                'biaya_total' : 'Rp {:,.0f}',
            })
            .set_properties(**{'font-size': '13px'}),
        use_container_width=True,
        height=400
    )

    # ── Rekapitulasi ──────────────────────────────────────────────────────────
    st.subheader("Rekapitulasi per Ruangan")
    st.dataframe(
        df_rekap.style
            .format({
                'total_biaya': 'Rp {:,.0f}',
                'luas'       : '{:,.2f} m²',
            })
            .set_properties(**{'font-size': '13px'}),
        use_container_width=True
    )

    # ── Download ──────────────────────────────────────────────────────────────
    st.subheader("📥 Download")
    col1, col2 = st.columns(2)

    with col1:
        st.download_button(
            label="📥 Download Excel",
            data=to_excel(
                df_detail, df_rekap, grand_total, ppn,
                grand_total_ppn, estimasi_bawah, estimasi_atas
            ),
            file_name="RAB.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True
        )
    with col2:
        st.download_button(
            label="📥 Download PDF",
            data=to_pdf(
                df_detail, df_rekap, grand_total, ppn,
                grand_total_ppn, estimasi_bawah, estimasi_atas
            ),
            file_name="RAB.pdf",
            mime="application/pdf",
            use_container_width=True
        )