# Refund Swatter Lite 常见问题（FAQ）

## 是否支持本地 Supabase Docker 部署？
暂不支持。目前所有功能仅在云端 Supabase 项目上验证，`setup-simple.sh` 也默认通过 `supabase link --use-api` 与远程项目交互。本地通过 `supabase start` 启动的 Docker 环境暂未覆盖。

## 可以不配置定时（cron）任务吗？
完全可以。脚本中给出的 cron 配置只是可选补充，用于每隔几分钟自动重试 `process-notifications-cron`。实时通知处理在没有 cron 的情况下也能正常运行；只需在 `.env.project` 中将 `SETUP_CRON=false`，直接跳过这一步即可。

## 为什么 Edge Function 都关闭了 `verify_jwt`？
因为我们在函数内部实现了更严格的身份验证。共享的 `verifyAuth` 工具可同时处理 service role 调用、管理员校验以及 cron 回退逻辑。Supabase 官方也建议关闭 legacy 的 `verify_jwt` 选项——它只会用易于获取的 anon key 做签名校验。我们保持它关闭，并在代码里执行更完善的授权判断。

## 是否支持 Supabase Cloud 以外的部署？
暂不支持。项目依赖 Supabase 托管服务（如 Vault、pg_cron 以及通过 `supabase functions deploy --use-api` 完成的远程部署流程）。自建 Postgres 或其他云数据库目前无法运行。本项目可以部署到任意 Supabase Cloud 组织/地区，只要提供该项目的 reference ID 即可。

## 所有数据表都启用了行级安全（RLS）吗？
是的。基础迁移脚本会为 `public` 模式下的每张表执行 `ENABLE ROW LEVEL SECURITY`，并提供默认策略，仅允许已认证的管理员访问。如果需要扩展或收紧权限，请通过新的迁移添加自定义策略，不要关闭 RLS。

## 是否可以配置多个 Bundle ID？
当前版本是单租户设计，`config` 表只能保存一套 Apple 凭据，因此一次只支持一个 Bundle ID。如果需要服务多款应用，建议为每个应用创建独立的 Supabase 项目，或 fork 仓库后自行扩展多租户能力。
