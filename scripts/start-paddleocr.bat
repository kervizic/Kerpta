@echo off
chcp 65001 >nul 2>&1
title PaddleX OCR Serving - Kerpta
echo ============================================
echo   PaddleX OCR Serving - Kerpta
echo ============================================
echo.

:: Desactiver la verification de connectivite (accelere le demarrage)
set PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

:: ----------------------------------------------------------------
:: Etape 1 - Verifier Python
:: ----------------------------------------------------------------
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Python non trouve. Installez Python 3.10+ et ajoutez-le au PATH.
    pause
    exit /b 1
)
echo [OK] Python trouve.

:: ----------------------------------------------------------------
:: Etape 2 - Installer paddlepaddle-gpu 3.0+ (obligatoire pour PaddleX 3.4)
::
:: IMPORTANT : PaddleX 3.4.2 necessite PaddlePaddle >= 3.0.0
:: La version PyPI (2.6.2) est trop vieille et cause l'erreur
:: "set_optimization_level". Il faut installer depuis le repo officiel.
:: ----------------------------------------------------------------
python -c "import paddle; v=paddle.__version__; exit(0 if int(v.split('.')[0]) >= 3 else 1)" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installation de paddlepaddle-gpu 3.0+ depuis le repo officiel...
    echo [INFO] Desinstallation de l'ancienne version...
    pip uninstall -y paddlepaddle paddlepaddle-gpu >nul 2>&1
    echo [INFO] Installation paddlepaddle-gpu 3.0.0 pour CUDA 11.8...
    pip install paddlepaddle-gpu==3.0.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/
    if %errorlevel% neq 0 (
        echo [WARN] CUDA 11.8 echoue, tentative CUDA 12.6...
        pip install paddlepaddle-gpu==3.0.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu126/
        if %errorlevel% neq 0 (
            echo [WARN] GPU echoue, installation CPU...
            pip install paddlepaddle==3.0.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
        )
    )
) else (
    echo [OK] PaddlePaddle 3.0+ deja installe.
)

:: ----------------------------------------------------------------
:: Etape 3 - Installer PaddleX si absent
:: ----------------------------------------------------------------
python -c "import paddlex" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installation de PaddleX...
    pip install paddlex==3.4.2
    if %errorlevel% neq 0 (
        echo [ERREUR] Echec installation paddlex.
        pause
        exit /b 1
    )
    echo [OK] PaddleX installe.
) else (
    echo [OK] PaddleX deja installe.
)

:: ----------------------------------------------------------------
:: Etape 4 - Installer le plugin serving
:: ----------------------------------------------------------------
echo [INFO] Verification du plugin serving...
paddlex --install serving
echo [OK] Plugin serving pret.

:: ----------------------------------------------------------------
:: Etape 5 - Supprimer le cache modele corrompu si besoin
:: ----------------------------------------------------------------
if exist "%USERPROFILE%\.paddlex\official_models\PP-DocLayoutV2" (
    echo [OK] Cache modele PP-DocLayoutV2 present.
)

:: ----------------------------------------------------------------
:: Etape 6 - Detecter GPU et demarrer
:: ----------------------------------------------------------------
echo.
set DEVICE=cpu
python -c "import paddle; exit(0 if paddle.device.is_compiled_with_cuda() and paddle.device.cuda.device_count() > 0 else 1)" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] GPU detecte
    set DEVICE=gpu
) else (
    echo [INFO] Pas de GPU, demarrage en CPU.
)

echo.
echo ============================================
echo   Device : %DEVICE%
echo   Endpoint : http://0.0.0.0:12321/layout-parsing
echo   Ctrl+C pour arreter
echo ============================================
echo.

paddlex --serve --pipeline PaddleOCR-VL --device %DEVICE% --host 0.0.0.0 --port 12321

echo.
echo [INFO] PaddleX s'est arrete.
pause
