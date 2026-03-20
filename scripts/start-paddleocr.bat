@echo off
echo ============================================
echo  Demarrage PaddleX Serving - PaddleOCR-VL
echo  Port : 12321
echo  CPU uniquement (preserve la VRAM)
echo ============================================

:: Desactiver la verification de connectivite (accelere le demarrage)
set PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

:: Verifier si Python est installe
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Python non installe. Installez Python 3.10+ depuis python.org
    pause
    exit /b 1
)

:: Etape 1 - Verifier/installer les packages
python -c "import paddlex" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installation de PaddlePaddle + PaddleOCR + PaddleX...
    echo [INFO] Cela peut prendre quelques minutes...
    pip install paddlepaddle "paddleocr[doc-parser]" paddlex
    echo [LOG] pip termine avec code %errorlevel%
    python -c "import paddlex" >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERREUR] paddlex non importable apres installation.
        pause
        exit /b 1
    )
    echo [OK] Packages installes.
) else (
    echo [OK] PaddleX deja installe.
)

:: Etape 2 - Verifier/installer le plugin serving
echo [LOG] Verification du plugin serving...
paddlex --install serving 2>&1 | findstr /C:"Successfully installed" /C:"already installed" /C:"already exists" >nul 2>&1
:: On relance systematiquement --install serving, la commande est idempotente
echo [INFO] Installation/verification du plugin serving...
paddlex --install serving
echo [LOG] paddlex --install serving termine avec code %errorlevel%
echo [OK] Plugin serving pret.

:: Etape 3 - Demarrage
echo.
echo ============================================
echo  Serveur PaddleX pret a demarrer
echo  Endpoint : http://0.0.0.0:12321/layout-parsing
echo ============================================
echo.

paddlex --serve --pipeline PaddleOCR-VL --device cpu --host 0.0.0.0 --port 12321

pause
