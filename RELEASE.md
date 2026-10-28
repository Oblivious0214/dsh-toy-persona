# 人设切换 · Toy 分支 v0.3.1-toy.13

基于 [yupaoa/dsh-persona-switcher](https://github.com/yupaoa/dsh-persona-switcher) 主分支 `0.3.1` 继续修改。

## 兼容与安装

DSH 建议测试版 **`0.2.1-rc.3-22ddee3`**或更高；表情兼容针对 **dsh-meme `0.1.64`**。

下载附件 `dsh-persona-switcher-0.3.1-toy.13.tgz`，在 DSH 插件页通过本地安装包入口安装并重启。也可使用命令（把 `desktop` 换成实际 profile）：

```sh
dsh plugin --profile desktop add "https://github.com/Oblivious0214/dsh-toy-persona/releases/download/v0.3.1-toy.13/dsh-persona-switcher-0.3.1-toy.13.tgz"
```

## 本版功能

- 输入框下方直接搜索、选择或添加人设，按钮显示当前角色名；每个对话单独记住选择，重启后恢复。
- 角色设置页支持设为默认；默认只用于之后新建且未作选择的对话，旧对话保持原样。
- 检测到 Fish TTS 后显示绑定音色入口，可在保存前试听；已有音色数据兼容保留。
- 角色默认头像可交给配套 QQ 界面使用，手动会话头像优先，历史会话头像快照保留。
- 检测到 dsh-meme 后，可多选优先图库、标签，补充表情提示，并选择跟随原插件、低频、适中、高频或不主动发。
- 角色频率只在当前会话的提示词组装中覆盖冲突的通用主动斗图建议，保留 dsh-meme 的发送方式与渠道限制，不修改其插件文件或全局配置。角色修改在下一次组装时生效，切换或取消人设后恢复相应规则。

人设切换保留模型、工具和权限。表情频率是模型提示，不是按概率或轮数强制限流。Fish 音色同步使用原插件的全局默认音色，多窗口同时合成不保证音色隔离；试听会调用已配置的 Fish 服务。常规、诊断及立绘编辑入口暂时隐藏，已有数据保留。详见 [媒体说明](docs/media-integration.md) 和 [更新记录](CHANGELOG.md)。


## 验证与致谢

发布准备已通过客户端构建、bundle 检查、完整模拟回归与 Edge 浏览器回归。DSH 实际提示词组装组件与原版 dsh-meme 提示代码的兼容检查覆盖插件加载顺序、角色编辑、Web/QQ/微信规则、会话隔离及卸载。测试没有发送真实平台消息或操作设备。

感谢原作者 yupaoa 和 DeepSeek Harness 提供的人设、提示词及插件接口，也感谢 Fish TTS 与 dsh-meme 提供媒体能力。原许可与来源说明随包保留。
