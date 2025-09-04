# Refund Swatter Lite

简体中文 | [English](./README.md)

基于 Supabase 的简化版单租户 Apple App Store 退款预防服务。

## 演示视频

[![RefundSwatterLite Demo](https://img.youtube.com/vi/j-88H8j7btI/maxresdefault.jpg)](https://www.youtube.com/watch?v=j-88H8j7btI)

观看 [完整的设置和使用教程](https://www.youtube.com/watch?v=j-88H8j7btI) (YouTube)。

## 概述

Refund Swatter Lite 处理 Apple 的 CONSUMPTION_REQUEST 通知，并在规定的 12 小时窗口内将消费信息发送回 Apple，帮助减少欺诈性退款。

### 主要特性

- **单应用支持** - 针对单个应用部署优化
- **100% Supabase** - 无需额外服务器
- **自动处理** - 自动处理通知
- **12 个消费字段** - 计算所有必需的 Apple 字段
- **安全保管库存储** - 私钥在 Supabase Vault 中加密
- **简单设置** - 一个配置文件，一个设置脚本

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

## 许可证

根据 Apache License 2.0 授权，详见 [LICENSE](./LICENSE)。

## 支持

如有问题或疑问，请在 GitHub 上提交 issue。
