# 美术主题发布与回退操作手册

本手册对应TASK-ART-06-01.1（原06-01的最小修复），批次`explorer-art-task06-01-1-70ff6c849bd173d9`。它提供本机生产构建预览和主题回退演练步骤，不授予合并、推送、部署或任何外部环境写入权限。作者自检完成后交回原审核；非作者演练待原审核，不能由作者自签替代。实际结果与耗时见[本批执行报告](<D:/AI workplace/outputs/stage-pair-launches/explorer-art-task06-01-1-70ff6c849bd173d9-execution-report.md>)。

## 1. 当前基线和唯一开关

默认“深空”为`deep-space`；“晨曦”的接口值仍为`legacy`。唯一产品开关是`NEXT_PUBLIC_EXECUTOR_THEME=deep-space|legacy`。本手册只使用这两个值；当前解析器对未设置值采用深空，对其他值回退legacy，因此拼写错误也可能回到晨曦，操作者必须显式核对值。

这个NEXT_PUBLIC变量在构建时写入产物。先设置进程环境，再运行原`pnpm build`，然后重启读取该产物的受控本地实例。仅修改正在运行进程的环境或复用旧.next，不算已完成主题切换。

输入仓库`D:/AI workplace/探索者号`，分支`feature/stage4-bridge-five-panels`，源码HEAD`7778adc9c5cb2e05d2bdf03e396e5dfd8f5df99b`。原05-03已通过独立工程审核，12张用户批准PNG和审批文档保持；本手册没有新的视觉改动。README记载既有Beta为`v0.1.0-beta.1`，本批不重新核验远端运行状态。既有外部发布背景见[Beta发布回滚与监控Runbook](阶段6/阶段6_Beta发布回滚与监控_Runbook.md)，不能直接沿用其中历史RC或deployment ID执行外部动作。

## 2. 前置检查与工具

在本机新开PowerShell终端。不要运行README安装、db:start或db:reset步骤：本演练使用已有依赖和静态Preview，不需要数据库或真实账户。不要清缓存、改.env、下载浏览器、安装依赖或拉镜像。原用户未提交文件保持。

```powershell
Set-Location -LiteralPath 'D:/AI workplace/探索者号'
$artNode = 'C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$artGit = 'C:/Program Files/Git/cmd/git.exe'
$artHelper = 'D:/AI workplace/scripts/explorer_art_task06011_70ff6c849bd173d9_drill_v2.mjs'
$artOut = 'D:/AI workplace/outputs/stage-pair-launches/explorer-art-task06-01-1-70ff6c849bd173d9-evidence'
& $artNode --version
if ($LASTEXITCODE -ne 0) { throw 'Node检查失败' }
& $artGit -C 'D:/AI workplace/探索者号' branch --show-current
& $artGit -C 'D:/AI workplace/探索者号' rev-parse HEAD
& $artGit -C 'D:/AI workplace/探索者号' diff --cached --name-only
if ((Get-FileHash -LiteralPath $artHelper -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'cb6b3be2ba78d72c655334c118acd13b73c6d73f87c6512313db9e0d38d97dc9') { throw '演练脚本SHA不符，停止' }
if (Get-NetTCPConnection -State Listen -LocalPort 3021 -ErrorAction SilentlyContinue) { throw '3021端口已占用；不要停止其他进程' }
```

期望分支匹配、暂存输出为空。作者运行时HEAD为上述源码版本；非作者运行时允许HEAD为本批仅4目标提交且父提交为该源码版本，helper逐项核对4文件名单、原非目标源码及新路由哈希。当前环境采用已有Node24.19.0、Next16.3.0、Playwright1.61.1和Chromium149.0.7827.55。仓库packageManager声明pnpm11.5.0；本机既有离线启动器实测为11.19.0（见本批pnpm-version.log），本演练据实使用该现成入口并记录此差异，不安装或下载其他版本。README中的CI Node22.22.3仍是CI权威值，本机演练不是改写CI要求。

字体沿用本机华文行楷STXingkai和Noto Sans SC。helper会校验浏览器及两字体原文件SHA，并读取实际有渲染字形的节点命中的字体；手机布局中隐藏节点没有字形，探针记录它们后检查首个真实渲染节点，与原视觉用例相同；缺少文件或版本漂移就停止，不下载替代。本手册冻结端口为3021。

## 3. 演练helper与输入来源

辅助脚本位于`D:/AI workplace/scripts/explorer_art_task06011_70ff6c849bd173d9_drill_v2.mjs`，SHA-256为`cb6b3be2ba78d72c655334c118acd13b73c6d73f87c6512313db9e0d38d97dc9`；它是本机环境专用工具，未纳入产品仓库。完整源码可读取，不依赖作者记忆。它调用已安装的pnpm入口`C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs`执行原`pnpm build`，随后通过已有Next的生产模式`dev=false`读取生成的.next，监听`127.0.0.1:3021`。这是生产构建观察，不是开发服务器或视觉回归测试入口。

参数为`<全新运行名> <author|reviewer>`；运行名必须以对应角色开头，且仅包含小写字母、数字和连字符。输出目录必须不存在，复演用新名字保留每次证据。作者使用`author-deep-space-02`、`author-legacy-02`；原审核者使用下文reviewer名字，不要把作者结果算作非作者结果。

依赖的只读本批输入如下，全部在`$artOut`中：

| 文件 | 用途 | SHA-256 |
| --- | --- | --- |
| freeze.json | 原783跟踪/46未跟踪及批准输入冻结 | `5ff02e9715cd40bc421236a1755199f932459f767a124e70d775d5355c389b0d` |
| case-freeze.json | 两主题、六页、两视口、30秒最低观察窗口 | `1de6c9908704a2920ac4511e299f9f3a90c0a2f97fb5134af95b4b229f8d0b54` |
| next-env-original.d.ts | 原Next声明字节，用于已知生成差异恢复 | `ab48c231dbee7bc9cd5700ea72c49833163afdb6bf48b863c9376d253c8c0b98` |

`document-freeze-v2.json`在定稿后保存三文档各自SHA；product-freeze-v2.json另冻结唯一新增路由SHA，helper开始和结束都会按当前文件重算并核对；本文不嵌入自身的循环哈希。每个运行的lifecycle.json再次绑定文档SHA、源码HEAD、主题、角色和运行ID。若这些文件缺失或不匹配，停止并报告缺口，不临时重建冻结文件绕过检查。

helper将外部服务配置置空，关闭Connected/Phase5测试入口，使用原静态Preview虚构数据，不写数据库；只在进程内设置环境，退出不会改父终端或.env。构建与服务串行运行。Next生成的next-env.d.ts只允许已确认的root-params类型导入差异，保存生成字节并确认没有并发变化后恢复原字节；其他差异不覆盖。

### 默认图标请求的最小修复合同

当前没有站点图案，唯一新增`src/app/favicon.ico/route.ts`明确处理浏览器默认请求：GET `/favicon.ico`返回204，正文0字节；HEAD由现有Next自动沿用GET语义。该唯一路由显式`dynamic = "force-dynamic"`，防止Next将这个metadata路径的204写入静态缓存后用非null字节体重建响应；不改变其他路由缓存或产品配置。没有图像文件、品牌图标、远程资源或metadata改动。helper在真实生产服务显式验证GET/HEAD的204空响应、无重定向，并验证另一个不存在的URL仍404，避免把错误请求全部吞掉。

普通浏览器页面不使用网络拦截，自动favicon请求按真实服务响应记录，至少实际发生一次且全部204。全部console/page/request/HTTP错误保持检查；显式不存在URL的404是单独HTTP对照，不作为页面访问场景，不过滤浏览器错误。原06-01的404与探针失败保留在旧批证据中，修复前后通过新源码/文档/helper冻结绑定。

## 4. 深空构建与本地观察

原审核者在第2节终端继续执行。以下名字若已存在，保留旧目录，换一个未使用的数字后缀；不要删除重跑。首次作者自检将`reviewer`及运行名前缀一致替换为`author`，其他步骤相同。

```powershell
$env:NEXT_PUBLIC_EXECUTOR_THEME = 'deep-space'
& $artNode $artHelper 'reviewer-deep-space-01' 'reviewer'
if ($LASTEXITCODE -ne 0) { throw '深空构建或观察失败；保留日志，停止回退演练' }
Get-Content -LiteralPath "$artOut/reviewer-deep-space-01/lifecycle.json" -Raw
```

helper实际构建命令等价于在本仓库执行`pnpm build`，完整Node/pnpm argv、PID、时间、退出码、构建日志SHA和BUILD_ID记入各运行目录。浏览器用原已安装Chromium，固定时钟2026-08-18T01:00:00.000Z、zh-CN、Asia/Shanghai、缩放1和减少动态效果；浏览器色彩偏好始终为dark，两个主题只靠产品主题变量区分。

期望：build-command.json退出0；六核心页面`/`、`/project-galaxy`、`/flight-log`、`/mission-control`、`/decision-archive`、`/copilot`各在1440×900和390×844检查，共12次；HTTP200、主要标题与演示内容存在、一个main及主标题、无横向溢出，根元素`data-executor-theme=deep-space`，body背景`rgb(3, 7, 17)`。实际标题命中华文行楷、正文命中Noto Sans SC；控制台、页面、请求及HTTP错误均为0。

代表性截图为首页桌面和手机整页两张，人工打开检查文字、导航、卡片和星空是否可读。它们只是工程观察附件，不能覆盖正式12张PNG或成为新审美批准。其余10个页面/视口同样有独立JSON观察记录。

## 5. 一次主题值切换与晨曦回退

必须等深空运行返回、确认自有实例已关闭后，保持同一仓库、源码、三文档、工具、端口和其他产品配置，仅将该主题值从deep-space改为legacy，再构建并启动新实例：

```powershell
$env:NEXT_PUBLIC_EXECUTOR_THEME = 'legacy'
& $artNode $artHelper 'reviewer-legacy-01' 'reviewer'
if ($LASTEXITCODE -ne 0) { throw '晨曦回退失败；保留原始失败，不改源码或数据求通过' }
Get-Content -LiteralPath "$artOut/reviewer-legacy-01/lifecycle.json" -Raw
```

期望同样为原build退出0、六页×两视口12次观察通过，根元素`data-executor-theme=legacy`、body背景`rgb(242, 244, 241)`。标题/正文和业务内容、页面几何应保持一致；灰白底色为晨曦原样。按两套JSON逐页面/视口比较文本、主标题数量、页面宽高与字体，不用截图名字推断主题。

“一次值切换”指唯一产品配置从deep-space→legacy发生一次变化。运行ID、证据目录、PID、时间和BUILD_ID属于记录元数据；它们自然不同，不是额外产品开关。本演练在legacy产物完成后结束，不自动再切回深空，不更改源码、数据库、业务契约或持久环境文件。

## 6. 观察窗口、回退触发与收尾

操作规定：每个主题自第一轮页面观察起至少观察30秒，完整页面检查若更久则按实际耗时记录，不压缩为30秒。lifecycle.json的observationStartedAt、observationEndedAt和observationSeconds是本次实际观测，不是线上可靠性保证。helper在不足30秒时保持最后一个已跟踪场景页面打开并持续捕获全部运行时错误，不新开未跟踪页面。

本地停止/回退触发：构建非0、主题DOM与配置不符、主要内容缺失、任一路由非200、横向溢出、字体不符或任何运行时/请求错误，均停止当前步骤，保留目录。深空运行成功是本次受控回退演练的前置条件；若它失败，不把未经验证产物当作发布版本。需要改源码、改数据、改主题接口或增加其他产品配置才能回退时，本批停止并向原审核提供最小缺口。

正常收尾由helper在finally关闭本run浏览器、自建HTTP服务和Next实例，恢复已知Next生成差异；不会终止其他进程或共享Docker/数据库。操作者检查lifecycle.json的exitCode=0、serverClosed/appClosed/browserClosed/nextEnvRestored均为true，再检查端口：

```powershell
if (Get-NetTCPConnection -State Listen -LocalPort 3021 -ErrorAction SilentlyContinue) { throw '端口仍占用：先核对ownership.json的PID，不要宽泛终止进程' }
& $artGit -C 'D:/AI workplace/探索者号' diff --check
if ($LASTEXITCODE -ne 0) { throw '工作区差异检查失败' }
& $artGit -C 'D:/AI workplace/探索者号' diff --cached --name-only
```

原终端的主题值可保持legacy并关闭该终端；不要为清理删除.next、缓存、卷或原文件。中断导致收尾未完成时先读ownership.json和lifecycle.json，明确本run进程后由操作者采用精确进程处置；没有可验证归属时停止，不根据端口名猜测所有者。

## 7. 证据、复演与视觉回归入口

每个独占运行目录保存build.log、build-command.json、BUILD_ID、ownership.json、lifecycle.json、12个逐页面/视口JSON、2张代表性PNG，以及必要时的Next生成声明备份。保存真实失败、环境存在性和哈希，不记录凭据。作者[执行报告](<D:/AI workplace/outputs/stage-pair-launches/explorer-art-task06-01-1-70ff6c849bd173d9-execution-report.md>)记录两套自检、完整命令与SHA索引；原审核者独立读取定稿手册、执行reviewer两套命令并保存自己的记录，随后决定工程A。作者自检不能充当该签字。

原视觉回归入口是`pnpm test:e2e:visual -- --project=chromium`，它依赖受控Next开发预览及开发指示器端点，不直接用于本手册生产实例。具体合同见[原配置](../../playwright.visual-regression.config.ts)、[原runner](../../scripts/run-visual-regression.mjs)、[正式快照审批](../design/art-system/visual-regression-approval.md)。本修复批会在独立受控开发预览下执行原普通12项零差异检查，不更新正式快照；完整发布就绪回归由另行派发的06-02执行。

## 8. 首次发布限制与外部边界

当前视觉资产为CSS-only空清单，见[asset-manifest.json](../../public/art/executor/asset-manifest.json)；首次发布不含生产生成图、远程字体、新依赖或数据库迁移。保留已批准的星空、主卡alpha0.8、嵌套透明、文字1和现有布局。

未来外部发布只列操作边界：先完成06-02独立发布就绪审核与GATE-ART-002，再在06-03形成交接入口；之后仍需用户另行明确批准目标仓库/分支/环境及具体合并或部署动作。获得外部授权后，操作者应重新核对当时平台、目标commit、环境值、当前健康回退点和观察计划，再按获批范围构建/发布并复核主题及页面；不得照抄历史Beta的RC或deployment ID。

本文没有执行也没有授权push、merge、deploy、真实账户操作、云端数据变更或付费。外部发布后观察窗口必须在实际授权中另外明确；本次每主题30秒本地观察不能代替线上观察。若发生外部回退需求，保持最后已核验健康版本并申请该具体动作授权，不以本手册或Gate通过代替授权。
