# 默认字体

随软件附带未经修改的 **Noto Sans CJK SC Regular 2.004**，用于在没有系统字体时生成基本的单行文字轮廓。支持常用简体中文、拉丁字母、重音字母及韩文；具体缺字仍由生成器检查，不能保证覆盖所有 Unicode 字符。

- [官方源仓库](https://github.com/notofonts/noto-cjk/tree/main/Sans/OTF/SimplifiedChinese)
- 固定来源提交、文件版本、下载地址及 SHA-256 见 `manifest.json`。
- `COPYRIGHT.txt` 保留字体中的版权声明。
- `OFL.txt` 是完整 SIL Open Font License 1.1；字体可随软件分发，请保留这些声明和许可文件。

Python wheel 和桌面发行包都包含本目录。程序按文件内容指纹验证默认字体，不依赖用户电脑安装同名字体。安装字体仅在本机读取，字体路径不会写入文字源信息，也不会自动把第三方系统字体复制到项目中。
