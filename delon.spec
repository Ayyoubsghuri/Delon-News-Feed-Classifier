# PyInstaller spec for Delon.exe  —  build with:  pyinstaller delon.spec
# Expects the React app to be compiled into ./build first.
import os
from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

datas = [
    ("build", "build"),
    ("fonts", "fonts"),
    ("json", "json"),
]

hiddenimports = (
    collect_submodules("webview")
    + ["main", "newspaper_pdf", "sklearn.feature_extraction.text", "sklearn.metrics.pairwise"]
)

a = Analysis(
    ["desktop.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=[
        "torch", "transformers", "sentence_transformers", "tensorflow",
        "matplotlib", "IPython", "notebook", "pygame", "tkinter",
    ],
    noarchive=False,
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="Delon",
    icon=os.path.join("assets", "delon.ico"),
    console=False,
    upx=False,
    runtime_tmpdir=None,
)
