# escape=`

# Use the latest Windows Server Core 2019 image.
FROM mcr.microsoft.com/windows/servercore:ltsc2019 AS base

ENV DOCKER_BUILD=true

# Restore the default Windows shell for correct batch processing.
SHELL ["cmd", "/S", "/C"]

# ================= Install Chocolately ====================================================================
ENV chocolateyVersion=1.4.0
RUN @powershell iex ((new-object net.webclient).DownloadString('https://chocolatey.org/install.ps1'))

# ================= Install Git ============================================================================
RUN choco install git.install -y
RUN git config --system core.longpaths true

# ================= Install Strawberry Perl ================================================================
RUN choco install nasm strawberryperl python -y

# ================= Install Gstreamer ======================================================================
RUN curl -SL --output gstreamer-1.0-msvc-x86_64-1.20.3.msi https://gstreamer.freedesktop.org/data/pkg/windows/1.20.3/msvc/gstreamer-1.0-msvc-x86_64-1.20.3.msi
RUN curl -SL --output gstreamer-1.0-devel-msvc-x86_64-1.20.3.msi https://gstreamer.freedesktop.org/data/pkg/windows/1.20.3/msvc/gstreamer-1.0-devel-msvc-x86_64-1.20.3.msi
RUN msiexec /i gstreamer-1.0-msvc-x86_64-1.20.3.msi ADDLOCAL=ALL /qb
RUN msiexec /i gstreamer-1.0-devel-msvc-x86_64-1.20.3.msi ADDLOCAL=ALL /qb
RUN setx /M GSTREAMER_ROOT_MSVC_X86_64 "C:\gstreamer\1.0\msvc_x86_64"
RUN setx GST_PLUGIN_SYSTEM_PATH "C:\gstreamer\1.0\msvc_x86_64\lib\gstreamer-1.0"
RUN setx /M PATH "%PATH%;%GSTREAMER_1_0_ROOT_MSVC_X86_64%\bin"

# ================= Install Python dependencies ============================================================
RUN pip install boto3

# ================= Install AWS CLI V2 =====================================================================
RUN start /wait msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi /quiet /qn /norestart
RUN setx /M PATH "%PATH%;C:\Program Files\Amazon\AWSCLIV2"

# Use the latest Windows Server Core 2019 image.
FROM base AS builder

RUN `
  # Download the Visual Studio 2019 Build Tools bootstrapper.
  curl -SL --output vs_buildtools.exe https://aka.ms/vs/16/release/vs_buildtools.exe `
  `
  # Install Build Tools 
  && (start /w vs_buildtools.exe --quiet --wait --norestart --nocache `
  --installPath "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\BuildTools" `
  --add Microsoft.VisualStudio.Workload.NativeDesktop `
  --add Microsoft.VisualStudio.Component.TestTools.BuildTools `
  --add Microsoft.VisualStudio.Component.VC.CMake.Project `
  --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
  --add Microsoft.VisualStudio.Component.VC.ASAN `
  --add Microsoft.VisualStudio.Component.Windows10SDK.18362 `
  --add Microsoft.VisualStudio.Component.VC.ATLMFC `
  || IF "%ERRORLEVEL%"=="3010" EXIT 0) `
  `
  # Cleanup
  && del /q vs_buildtools.exe

# ===== Git Checkout latest Kinesis Video Streams Producer SDK (CPP) =======================================
WORKDIR /opt/
COPY kvs_msvc.patch .
RUN git clone --depth 1 --branch v3.3.1 https://github.com/awslabs/amazon-kinesis-video-streams-producer-sdk-cpp.git
WORKDIR /opt/amazon-kinesis-video-streams-producer-sdk-cpp/
RUN git apply ../kvs_msvc.patch

# ===== Build Kinesis Video Streams C++ Producer and GStreamer element =====================================
COPY build_kvs_windows.bat .
RUN call build_kvs_windows.bat

# ===== Set required environment variables =================================================================
RUN setx GST_PLUGIN_SYSTEM_PATH "%GST_PLUGIN_SYSTEM_PATH%;C:\opt\amazon-kinesis-video-streams-producer-sdk-cpp\build"
RUN setx /M PATH "%PATH%;C:\opt\amazon-kinesis-video-streams-producer-sdk-cpp\open-source\local\bin;C:\opt\amazon-kinesis-video-streams-producer-sdk-cpp\open-source\local\lib"

# ===== Install vcpkg ======================================================================================
WORKDIR /opt/
RUN git clone --depth 1 --branch 2023.02.24 https://github.com/Microsoft/vcpkg.git
RUN call .\vcpkg\bootstrap-vcpkg.bat

# ===== Install vcpkg packages =============================================================================
RUN vcpkg\vcpkg install "crow" --triplet x64-windows
RUN vcpkg\vcpkg install "cpp-jwt" --triplet x64-windows
RUN vcpkg\vcpkg install "aws-sdk-cpp[sns]" --recurse --triplet x64-windows
RUN vcpkg\vcpkg integrate install

# ===== Copy Windows Zoom SDK code =========================================================================
COPY zoom-sdk-windows-5.13.10.13355 /opt/zoom-sdk-windows-5.13.10.13355

# ===== Build Windows Zoom SDK code ========================================================================
WORKDIR /opt/
COPY build_zoom_app.bat .
RUN call build_zoom_app.bat

# Use the latest Windows Server Core 2019 image.
FROM base AS runner

RUN `
  # Download the Visual Studio 2019 Build Tools bootstrapper.
  curl -SL --output vs_buildtools.exe https://aka.ms/vs/16/release/vs_buildtools.exe `
  `
  # Install Build Tools 
  && (start /w vs_buildtools.exe --quiet --wait --norestart --nocache `
  --installPath "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\BuildTools" `
  --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
  --add Microsoft.VisualStudio.Component.Windows10SDK.18362 `
  || IF "%ERRORLEVEL%"=="3010" EXIT 0) `
  `
  # Cleanup
  && del /q vs_buildtools.exe

COPY --from=builder C:\opt\zoom-sdk-windows-5.13.10.13355\x64\bin /opt/bin
COPY --from=builder C:\opt\amazon-kinesis-video-streams-producer-sdk-cpp /opt/amazon-kinesis-video-streams-producer-sdk-cpp

# ===== Set required environment variables =================================================================
RUN setx GST_PLUGIN_SYSTEM_PATH "%GST_PLUGIN_SYSTEM_PATH%;C:\opt\amazon-kinesis-video-streams-producer-sdk-cpp\build"
RUN setx /M PATH "%PATH%;C:\opt\amazon-kinesis-video-streams-producer-sdk-cpp\open-source\local\bin;C:\opt\amazon-kinesis-video-streams-producer-sdk-cpp\open-source\local\lib"

HEALTHCHECK --interval=5s --timeout=60s CMD powershell -command `
  try { `
  $response = Invoke-WebRequest http://localhost:3000/health -UseBasicParsing;`
  if ($response.StatusCode -le 500) {return 0} `
  else {return 1}; `
  } catch {return 1}

WORKDIR /opt/bin