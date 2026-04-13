# app.py
import streamlit as st
from utils.calculator import load_hspk, load_upah
from utils.ui_comp import render_sidebar, render_input, render_hasil, hitung_rab, buat_rekap

HSPK_PATH = 'data/hspk_bandung_2026.csv'
PAID_PATH  = 'data/upah_tenaga_2026.csv'

st.set_page_config(page_title="RAB Automation", layout="wide")
st.title("RAB Otomatis")
st.caption("Rencana Anggaran Biaya dari file DXF — Kab. Bandung 2026")

@st.cache_data
def get_hspk():
    return load_hspk(HSPK_PATH)

def get_upah():
    return load_upah(PAID_PATH)

try:
    df_hspk = get_hspk()
    df_upah = get_upah()
    st.success(f"HSPK & Upah loaded: {len(df_hspk):,} material, {len(df_upah):,} upah")
except FileNotFoundError:
    st.error("File data tidak lengkap.")
    st.stop()

# ── Session state ─────────────────────────────────────────────────────────────
for key in ['df_detail', 'df_rekap', 'grand_total', 'ppn',
            'grand_total_ppn', 'estimasi_bawah', 'estimasi_atas']:
    if key not in st.session_state:
        st.session_state[key] = None

# ── Render ────────────────────────────────────────────────────────────────────
tinggi_dinding, faktor_bukaan, maks_jarak, harga_map = render_sidebar(df_hspk)
df_edit = render_input(maks_jarak)

if df_edit is not None:
    if st.button("Hitung RAB", type='primary', use_container_width=True):
        with st.spinner("Menghitung RAB..."):
            st.session_state.df_detail = hitung_rab(
                df_edit, harga_map, tinggi_dinding, faktor_bukaan, df_upah
            )
            (st.session_state.df_rekap,
             st.session_state.grand_total,
             st.session_state.ppn,
             st.session_state.grand_total_ppn,
             st.session_state.estimasi_bawah,
             st.session_state.estimasi_atas) = buat_rekap(
                st.session_state.df_detail, df_edit
            )

if st.session_state.df_detail is not None:
    render_hasil(
        st.session_state.df_detail,
        st.session_state.df_rekap,
        st.session_state.grand_total,
        st.session_state.ppn,
        st.session_state.grand_total_ppn,
        st.session_state.estimasi_bawah,
        st.session_state.estimasi_atas,
    )