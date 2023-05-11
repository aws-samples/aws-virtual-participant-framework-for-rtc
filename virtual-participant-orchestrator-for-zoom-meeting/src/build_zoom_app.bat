if defined DOCKER_BUILD (
    call "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
) else (
    call "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\VC\Auxiliary\Build\vcvars64.bat"
)
cd zoom-sdk-windows-5.12.8.10282\x64\demo\sdk_demo_v2\
msbuild sdk_demo_v2.vcxproj /p:configuration=release /p:platform=x64 