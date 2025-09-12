<p align="center">
  <a href="#" title="Refund Swatter Lite">
    <img src="docs/assets/logo.png" width="120" alt="Refund Swatter Lite logo" />
  </a>
</p>

<p align="center">
  <b>12 小时内阻止欺诈性退款 — 100% 基于 Supabase。</b>
  <br/>
  <sub>面向单应用、简单安全、开箱即用。</sub>
  <br/>
  <sub>密钥自持（BYOK）：你的 Apple 私钥不会上传到任何第三方平台。</sub>
</p>

<p align="center">
  <a href="#快速开始"><img alt="快速安装" src="https://img.shields.io/badge/快速安装-setup--simple.sh-22c55e?logo=gnubash&logoColor=white"></a>
  <a href="https://www.youtube.com/watch?v=j-88H8j7btI&utm_source=producthunt&utm_medium=github&utm_campaign=readme_top" target="_blank"><img alt="演示视频" src="https://img.shields.io/badge/Demo-2%20分钟视频-ff0000?logo=youtube&logoColor=white"></a>
  <a href="https://github.com/argus-sight/refund-swatter-lite/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/argus-sight/refund-swatter-lite?style=social"></a>
  <a href="./README.md"><img alt="English" src="https://img.shields.io/badge/English-README-blue"></a>
  <a href="#安全性"><img alt="密钥自持（BYOK）" src="https://img.shields.io/badge/密钥自持（BYOK）-已启用-8b5cf6"></a>
</p>

<p align="center">
  <a href="https://www.youtube.com/watch?v=j-88H8j7btI&utm_source=producthunt&utm_medium=github&utm_campaign=readme_hero" target="_blank">
    <img alt="RefundSwatterLite 演示" src="https://img.youtube.com/vi/j-88H8j7btI/maxresdefault.jpg" width="800" />
  </a>
  <br/>
  <sub>Product Hunt 访客你好！先看演示，再按下方快速安装。</sub>
</p>

---

# Refund Swatter Lite

简体中文 | [English](./README.md)

基于 Supabase 的简化版单租户 Apple App Store 退款预防服务。

## 概述

Refund Swatter Lite 处理 Apple 的 CONSUMPTION_REQUEST 通知，并在规定的 12 小时窗口内将消费信息发送回 Apple，帮助减少欺诈性退款。

### 主要特性

- **密钥自持（BYOK）** - Apple 私钥仅保存在你的 Supabase 项目内，无需上传到任何第三方平台
- **单应用支持** - 针对单个应用部署优化
- **100% Supabase** - 无需额外服务器
- **自动处理** - 自动处理通知
- **12 个消费字段** - 计算所有必需的 Apple 字段
- **安全保管库存储** - 私钥在 Supabase Vault 中加密
- **简单设置** - 一个配置文件，一个设置脚本

## 为什么是 Refund Swatter Lite？

- 痛点真实存在：不少 iOS 团队遭遇过“隔夜大规模恶意退款”，轻则几百刀、重则上万刀，还可能被下架。
- 关键机制：用户申请退款后，Apple 会向开发者发送最多 3 次 CONSUMPTION_REQUEST；只要在 12 小时窗口内及时、正确地回复包含消费信息（累计消费/累计退款/开发者偏好等），即可帮助 Apple 更“公平”地决策，从而显著降低恶意退款比例。退款周期最长可达 90 天，因此需要持续覆盖这一周期。
- 现有方案不足：如 RevenueCat 等三方平台虽支持自动回复，但通常需要把 App Store Server API 私钥（AuthKey.p8）与 In‑App Purchase Key 上传到其云端，把查询与操作权限交给第三方；对安全敏感团队（含企业）而言难以接受。
- 我们的取舍：本项目 100% 基于 Supabase，一键部署、零服务器维护；密钥自持（BYOK），Apple 私钥仅保存在你的 Supabase 项目（Vault/环境变量）内，绝不上传第三方。
- 可观测与可审计：自动答复 CONSUMPTION_REQUEST 的同时，展示各字段含义、任务与日志，方便排查与回溯。
- 实际收益：在保证 AuthKey 与 IAP Key 安全性的同时，显著减少恶意退款订单（对消耗型尤其明显）。

## 快速开始

### 前置要求

- Supabase 账户和项目
- 具有 App Store Server API 访问权限的 Apple Developer 账户
- Node.js 16+
- Supabase CLI（[安装指南](https://supabase.com/docs/guides/cli)）

### 安装

1. **克隆并配置**
```bash
git clone git@github.com:argus-sight/refund-swatter-lite.git
cd refund-swatter-lite

# 配置项目设置
cp .env.project.example .env.project
# 使用你的凭据编辑 .env.project
```

2. **运行设置脚本**
```bash
./setup-simple.sh
```

这将自动：
- 链接你的 Supabase 项目
- 应用数据库迁移
- 部署 Edge Functions
- 配置环境
- 设置定时任务
- 创建管理员用户

3. **配置 Apple 凭据**

访问 `http://localhost:3000` 的 Web 仪表板并添加：
- Bundle ID
- Issuer ID（来自 App Store Connect）
- Key ID（来自 App Store Connect）
- 私钥（.p8 文件内容）

4. **在 App Store Connect 中设置 webhook**
- Production URL：`https://your-project.supabase.co/functions/v1/webhook`
- Sandbox URL：`https://your-project.supabase.co/functions/v1/webhook`

## 项目结构

```
refund-swatter-lite/
├── supabase/
│   ├── functions/      # Edge Functions
│   └── migrations/     # 数据库架构
├── web/                # Next.js 仪表板
├── scripts/            # 实用脚本
└── .env.project        # 主配置文件
```

## 仪表板功能

- **概览** - 消费指标和系统健康状况
- **通知** - 查看和重新处理 Apple 通知
- **测试与初始化** - 测试 webhook 和导入历史数据
- **消费请求** - 跟踪处理状态
- **设置** - 管理 Apple 凭据

## 故障排除

### 常见问题

**Webhook 未接收到通知**
- 验证 App Store Connect 中的 webhook URL
- 检查 Edge Function 日志：`supabase functions logs webhook`
- 确保 Edge Functions 已部署
- 确保为 webhook Edge Function 禁用了 JWT 验证

**消费数据未发送**
- 验证定时任务是否正在运行
- 检查 config 表中的 Apple 凭据
- 查看 `send_consumption_jobs` 表中的错误

**测试通知失败**
- 确保选择了正确的环境
- 验证 Apple 凭据是否有效
- 检查 `apple_api_logs` 表中的错误

## 安全性

- 私钥在 Supabase Vault 中加密
- 所有 Edge Functions 的身份验证验证
- 服务角色密钥永不暴露给客户端
- CRON_SECRET 保护计划端点
- 不上传密钥到第三方（BYOK） — Apple 私钥仅保存在你的 Supabase 项目中

## 许可证

根据 Apache License 2.0 授权，详见 [LICENSE](./LICENSE)。

## 支持

如有问题或疑问，请在 GitHub 上提交 issue。
