@echo off
echo ============================================
echo  Demarrage PaddleX Serving - PaddleOCR-VL
echo  Port : 12321
echo  CPU uniquement (preserve la VRAM)
echo ============================================

:: Verifier si Python est installe
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Python non installe. Installez Python 3.10+ depuis python.org
    pause
    exit /b 1
)

:: Verifier si paddlex est installe, sinon l'installer
python -c "import paddlex" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installation de PaddlePaddle + PaddleOCR + PaddleX...
    echo [INFO] Cela peut prendre quelques minutes...
    pip install paddlepaddle "paddleocr[doc-parser]" paddlex
    :: Verifier que paddlex est bien importable malgre les warnings pip
    python -c "import paddlex" >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERREUR] Echec de l'installation. Verifiez votre connexion internet.
        pause
        exit /b 1
    )
    echo [OK] Packages installes.
)

:: Verifier si le plugin serving est installe, sinon l'installer
python -c "from paddlex.inference.serving import basic_serving" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installation du plugin serving...
    paddlex --install serving
    python -c "from paddlex.inference.serving import basic_serving" >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERREUR] Echec de l'installation du plugin serving.
        pause
        exit /b 1
    )
    echo [OK] Plugin serving installe.
)

echo.
echo [OK] Tout est installe.
echo Demarrage du serveur PaddleX (PaddleOCR-VL)...
echo Endpoint : http://0.0.0.0:12321/layout-parsing
echo.

paddlex --serve --pipeline PaddleOCR-VL --device cpu --host 0.0.0.0 --port 12321

pause
