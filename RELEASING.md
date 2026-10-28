# Toy 分支发布约定

当前版本 `dsh-persona-switcher@0.3.1-toy.14`，基于上游主分支 `563854472ae7fe3b2e96f6cbcb53428d3af81e1c` 的 `0.3.1`。

版本格式为 `上游主分支版本-toy.修订号`。同一基础递增 `toy.N`；合入新上游版本后从新基础的 `toy.1` 开始。保留上游包名、原作者署名与 MIT 许可。`-toy.N` 是 SemVer 预发布版本，按明确的 GitHub Release 附件手动更新；`+toy.N` 不参与版本排序，不用于此修订号。

公开维护分支为 `feat/dsh-toy-persona`，推送到 `fork`（`Oblivious0214/dsh-toy-persona`）。上游 `origin/main` 保持原样。本分支只提供 GitHub 安装包，不向 npm 发布同名包；继承的 npm 工作流仅允许原作者仓库执行。

## 发布步骤

1. 核对上游主分支基础，更新 `package.json`、`package-lock.json`、README、CHANGELOG 与 `RELEASE.md` 中的版本和兼容范围。
2. 执行 `npm run build`、`npm run verify`、`npm test`、`npm run test:browser`。本机可用 `PLAYWRIGHT_CHANNEL=msedge` 选择 Edge；浏览器测试使用隔离夹具。
3. 执行 `npm pack --ignore-scripts --pack-destination <发布目录>`。核对包名、版本、bundle id、补丁、本地化、运行时模块和许可，计算 SHA-256，保存为 `SHA256SUMS.txt`。
4. 确认生成的 `lib/client.js` 与源码一致，提交验证过的全部修改，推送 `feat/dsh-toy-persona` 分支。
5. 从该准确提交创建 tag `v0.3.1-toy.14`，创建 GitHub 预发布 Release，使用 `RELEASE.md` 为正文，仅附上 `.tgz`，校验文件保留在本地发布记录中。

不要将源码 ZIP 作为安装包。升级应使用新版本的完整附件地址，并按 DSH 提示重启。发布状态以远程分支和 Release 为准。
