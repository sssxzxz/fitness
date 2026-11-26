# 身体观察系统（第一版）

一个本地运行的 3D 人体解剖查看器，电脑和手机都能用。用途：认出不适的是哪块肌肉，用标准动作确认它，并长期记录。

## 启动

1. 安装 Node.js（18 或以上）：https://nodejs.org/
2. 双击启动脚本：
   - Windows：`start-windows.bat`
   - macOS：`start-mac.command`（第一次运行如果被系统拦截，右键 → 打开）
   - Linux：`./start-linux.sh`
3. 浏览器会自动打开 http://localhost:8686
4. 手机连同一个 Wi-Fi，打开启动窗口里显示的 `http://192.168.x.x:8686` 地址

窗口开着时服务一直在运行，关掉窗口就停止。Windows 第一次运行时防火墙可能会弹窗，需要允许"专用网络"，手机才能连上。

> 只在家里等可信的 Wi-Fi 下使用。服务没有密码，同一网络里的设备都能访问。

## 功能

| 功能 | 说明 |
|---|---|
| 7 个系统图层 | 骨骼、肌肉与筋膜、关节与韧带、心血管、神经与感官、内脏、淋巴。每层可单独开关、调透明度，用到时才加载 |
| 点选识别 | 点击任意结构，显示中文名、英文名、拉丁名、左右侧、所属分组和英文释义 |
| 隐藏 / 只看它 / 隐藏同组 / 撤销 | 一层层剥开去看深层结构（快捷键：H 隐藏，Esc 取消选择，Ctrl+Z 撤销） |
| 透视模式 | 被选中结构以外的部分变成半透明，深层肌肉也能看清 |
| 搜索 | 中文、英文、拉丁名都能搜 |
| 重点肌肉（37 个条目） | 头颈和躯干。每条包含抗阻确认动作、拉伸确认、触诊定位、与易混肌肉的区分、常见不适表现、解剖信息、训练动作 |
| 不适记录 | 记录肌肉、侧别、程度、感觉、诱发动作、诱因和备注。可以看单块肌肉的变化曲线，也可以把近 30 天的不适按左右侧画成热力图。支持导出 JSON/CSV |

记录保存在 `userdata/logs.json`，电脑和手机读写的是同一份。备份时复制这个文件就行。

## 数据说明与核对

- 3D 模型和英文释义来自 [Z-Anatomy](https://www.z-anatomy.com/)（CC BY-SA 4.0），源头是 BodyParts3D 和 Wikipedia。模型做了减面和压缩。
- **已修正的源数据错误**：Z-Anatomy 把斜方肌的"降部（上斜方肌）"和"升部（下斜方肌）"标反了，转换时已对调（见 `tools/fix_index.py`）。发现其他问题可以继续加到这个脚本里。
- 重点肌肉的中文内容（`app/data/muscles.js`）是整理的初稿，建议对照以下资料核对：Kendall《Muscles: Testing and Function》、[Kenhub](https://www.kenhub.com/)、[Physiopedia](https://www.physio-pedia.com/)。
- 本系统用来定位和记录，**不能代替医生诊断**。应用内"重点肌肉"页底部列出了需要就医的信号。

## 扩展

- **加肌肉条目**：在 `app/data/muscles.js` 里照现有格式添加。`bases` 填模型里的英文结构名，在应用中点击该结构就能看到。
- **加中文名**：编辑 `app/data/zh-terms.js`。
- **重新生成模型**（比如调整精度）：用 `tools/` 里的脚本。需要 Blender 的 Python 模块 `bpy`（Python 3.11）和 `@gltf-transform/cli`：
  ```
  python za_export.py <Z-Anatomy/Startup.blend> <输出目录> all
  python za_defs.py  <Startup.blend> <输出目录> app/data/definitions.json
  gltf-transform meshopt 输入.glb app/models/xxx.glb
  ```

## 许可

- 模型及其衍生数据（`app/models`、`app/data/index.json`、`app/data/definitions.json`）：CC BY-SA 4.0，署名 Z-Anatomy / BodyParts3D / Wikipedia。如果公开分发，这部分必须保持同样的许可。
- Three.js（`app/vendor/three`）：MIT。
