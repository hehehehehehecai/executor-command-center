# GitHub 安装管理合同 v1

T02 在既有安装、身份与逐仓库选择流程内扩展；不改变旧注册合同、32份迁移、T03默认关闭开关或完整校准语义。

## 服务端本人绑定与只读刷新

GET `/api/github/installations/current` 与 GET `/api/github/installations/manage` 不接受查询参数、请求体中的安装ID/URL或客户端主体。先用 getUser 验证会话，再以同一会话客户端和 RLS 读取本人 GitHub 身份及安装；读取结果仍显式校验 user_id、账号ID、唯一行与安全整数。

上游只允许现有 App JWT reader 的官方安装查询；其返回必须与原 installation ID、配置 app ID、本人 github_user_id 和 User 类型一致。上游返回后再读取本人安装与身份，变化则失败关闭。management 地址仅取官方响应 html_url；精确允许 `https://github.com/settings/installations/<当前安装ID>`，拒绝非HTTPS、userinfo、端口、伪子域、跨安装、查询/hash、编码绕过或其他路径；缺失/非法时无备用跳转。旧注册不要求 html_url，保留旧最小快照兼容。

current 返回独立版本、本人 subjectId、状态、是否可选择、是否需要重新确认、管理地址可用性及公开失败码。manage 每次重新核验后才303跳转；失败仅返回固定中文说明与回到接入页的站内路径。全部响应 private/no-store、Vary Cookie/Origin；非GET方法405，非空query拒绝，跨站 fetch 拒绝；普通读取不写本地安装，不要求合法GitHub setup回调携带Origin。

当前数据库 `register_verified_github_installation` 属于一次性state后的登记能力，会设置status并清除revoked_at；不适合普通刷新复用。T02不新增schema或在普通刷新中调用该函数。远端active但本地suspended/revoked时返回明确的重新确认要求，不绕过旧选库的本地授权门。用户通过原 start/setup 安全流程重新确认，或原生命周期事件已完成恢复后再刷新。远端暂停/404立即阻止当前界面新选择；错误不回退旧active。

## 状态与动作

| 状态 | 动作 |
|---|---|
| 未登记 | 安装只读GitHub App，沿用原state与safeReturnTo |
| active，且本地active | 常驻管理入口；返回后明确刷新；逐项选择 |
| suspended | 官方管理查看/恢复提示；应用所有者暂停时联系所有者；刷新重试；禁止新选择 |
| revoked或上游404 | 重新安装/确认连接；不作为首次未加载或空仓库 |
| 远端active、本地尚未恢复 | 明确“需重新确认连接”，沿用start/setup，不自动恢复权限 |
| 配置失败、读取失败、超时、限流、403 | 准确失败和重试；清除可用授权列表，不继续旧active |
| 组织安装 | 明确当前仅支持个人安装，不给管理或选库能力 |
| 管理地址缺失或非法 | 管理失败关闭；正常旧注册及独立合法仓库读取不被默默改写 |

GitHub修改授权后是否自动回跳取决于Redirect on update配置，不假设必有首次setup的state。本产品使用新窗口管理和明确“已返回，刷新授权和仓库”按钮；不轮询，不以修改权限回跳参数自报安装。刷新重新核验本人安装，再读取实时授权列表、本地选择与项目摘要；无自动全选、建项或同步。

## 界面及异步绑定

首页、T01真实“我的项目”列表、接入页均保留添加仓库入口，未登录沿用现有登录。项目身份来源仍为既有完整校准摘要，已存在项目标“已添加”；已选择无项目标“已选择，待建项”；摘要失败时状态未知，不编造已添加。

授权列表区分未加载、正在加载、成功空列表、失败。每仓库选择/失败/重试独立记录，成功项保持；同仓库忙碌时重复点击无额外请求。刷新/主体变化/组件卸载使旧代次无效；返回subjectId不匹配时丢弃。状态失效立即隐藏旧授权候选并禁止选择。取消选择保留原项目冲突保护。原T01会话边界继续在focus/pageshow验证账号并丢弃旧页面。

同次授权刷新通过仅限当前主体的界面事件，使共享账号卡重新读取原T01 `/api/auth/workspace` 摘要；不重新实现身份授权。摘要DTO再次匹配主体、绑定页面原始快照与请求代次，跨账号/迟到/退出后的响应不渲染；读取期间或失败隐藏旧安装/项目摘要。远端已核验暂停/404不能被旧本地active摘要覆盖。该界面事件不写数据库、不授予权限，真实访问仍由原verified会话接口和RLS裁定。

## 验证矩阵与来源

领域：官方URL合法、缺失、伪域、userinfo、非HTTPS、显式端口、协议相对、编码/路径/跨安装注入。应用：无会话、本人A/B、app/account/installation错配、组织、404/403/限流/超时、远端与本地状态、核验期间变更、只读无写入。HTTP：方法/query/跨站、固定错误、不泄露敏感字段和禁缓存。

组件与浏览器：三个入口、状态动作、返回刷新、授权增减、空与失败、A/B与乱序、逐仓库部分成功/失败重试、已有项目、重复点击、无自动建项/同步。真实本地SDK/RLS另行实测；GitHub上游响应始终为合成，不能称真实账号授权变更。

继承分母：单元203文件2065项，安全12文件59项（重叠），应用24文件90项，数据库45文件1044断言，T03浏览器13项。新增分层计数，不合并准确率。历史安装失败先复现保留，修复夹具缺失及旧文本定位后验证真实空状态与无副作用，不删除原场景。

官方依据（2026-09-28只读核对）：
- https://docs.github.com/en/rest/apps/apps#get-an-installation-for-the-authenticated-app
- https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps
- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url
