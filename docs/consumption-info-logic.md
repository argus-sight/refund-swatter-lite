# Consumption Info 计算逻辑分析

## 概述
Consumption Info 是发送给 Apple 的消费信息数据，用于协助 Apple 进行退款决策。当收到 `CONSUMPTION_REQUEST` 通知时，系统需要在 12 小时内响应并发送用户的消费数据。

## 数据结构

### 必需字段及当前实现

| 字段名 | Apple 要求 | 当前实现 | 说明 |
|--------|-----------|----------|------|
| **accountTenure** | 账户年龄（天数） | ✅ 正确 | 基于首次购买日期计算 |
| **appAccountToken** | 用户唯一标识 UUID | ✅ 正确 | 从 transactions 表获取 |
| **consumptionStatus** | 消费状态 (0-3) | ⚠️ 简化实现 | 见下方详细说明 |
| **customerConsented** | 用户同意 (boolean) | ✅ 正确 | 固定为 true |
| **deliveryStatus** | 交付状态 (0-5) | ✅ 已修复 | 固定为 0（成功交付） |
| **lifetimeDollarsPurchased** | 累计购买金额 | ✅ 正确 | SUM(transactions.price) |
| **lifetimeDollarsRefunded** | 累计退款金额 | ✅ 正确 | SUM(refunds.refund_amount) |
| **platform** | 平台 | ✅ 正确 | 固定为 1 (Apple) |
| **playTime** | 使用时长（小时） | ✅ 正确 | 从 usage_metrics 获取 |
| **refundPreference** | 退款偏好 (0-3) | ✅ 已修复 | 从 config 表读取 |
| **sampleContentProvided** | 提供试用 (boolean) | ✅ 正确 | 固定为 false |
| **userStatus** | 用户状态 (0-4) | ⚠️ 简化实现 | 见下方详细说明 |

## 字段详细说明

### 1. consumptionStatus（消费状态）
**Apple 定义：**
- 0 = 未声明（不提供信息）
- 1 = 未消费
- 2 = 部分消费
- 3 = 完全消费

**当前实现（简化版）：**
```sql
IF v_content_accessed THEN
    v_consumption_status := 2; -- 部分消费
ELSIF v_has_active_subscription THEN
    v_consumption_status := 1; -- 未消费
ELSE
    v_consumption_status := 0; -- 未声明
END IF;
```

**问题：** 没有真实追踪消费程度，无法区分部分消费和完全消费

### 2. deliveryStatus（交付状态）
**Apple 定义：**
- 0 = 成功交付且正常工作
- 1 = 质量问题导致未交付
- 2 = 交付了错误的项目
- 3 = 服务器故障导致未交付
- 4 = 游戏内货币变化导致未交付
- 5 = 其他原因未交付

**当前实现：**
```sql
v_delivery_status := 0; -- 固定为成功交付
```

**说明：** 开发者需确保在发送消费信息前，商品已成功交付

### 3. refundPreference（退款偏好）
**Apple 定义：**
- 0 = 未声明
- 1 = 倾向批准退款
- 2 = 倾向拒绝退款
- 3 = 无偏好

**当前实现：**
```sql
SELECT refund_preference INTO v_refund_preference FROM config WHERE id = 1;
v_refund_preference := COALESCE(v_refund_preference, 0);
```

**说明：** 可在 Web 界面 Settings 页面配置

### 4. userStatus（用户状态）
**Apple 定义：**
- 0 = 未声明
- 1 = 账户活跃
- 2 = 账户暂停
- 3 = 账户终止
- 4 = 账户受限访问

**当前实现（简化版）：**
```sql
IF v_lifetime_dollars_purchased = 0 THEN
    v_user_status := 0; -- 未声明
ELSIF v_has_active_subscription THEN
    v_user_status := 1; -- 活跃
ELSE
    v_user_status := 1; -- 默认活跃
END IF;
```

**问题：** 没有真实的账户状态管理系统

## 数据流程

1. **触发时机**
   - 收到 Apple 的 `CONSUMPTION_REQUEST` 通知
   - 必须在 12 小时内响应

2. **数据收集**
   - 从 `transactions` 表获取用户购买历史
   - 从 `refunds` 表获取退款历史
   - 从 `usage_metrics` 表获取使用数据
   - 从 `config` 表获取退款偏好设置

3. **发送流程**
   ```
   process-notifications (接收通知)
   ↓
   consumption_requests (创建请求记录)
   ↓
   send_consumption_jobs (创建发送任务)
   ↓
   calculate_consumption_data() (计算数据)
   ↓
   send-consumption (发送给 Apple)
   ```

## 改进建议

### 短期改进
1. **添加消费追踪**
   - 记录具体的内容消费情况
   - 区分部分消费和完全消费

2. **添加账户状态管理**
   - 实现真实的用户账户状态系统
   - 支持暂停、终止、受限等状态

### 长期改进
1. **智能退款偏好**
   - 基于用户历史行为动态调整
   - 针对不同用户群体的差异化策略

2. **详细的交付状态追踪**
   - 记录交付失败的具体原因
   - 支持不同类型的交付问题报告

## 配置说明

### Web 界面配置
在 Dashboard 的 Settings 页面可以配置：
- **Refund Preference**: 选择退款偏好策略

### 注意事项
1. **deliveryStatus** 默认为 0，开发者需确保交付成功
2. **refundPreference** 只是建议，最终决定权在 Apple
3. 必须在 12 小时内响应 `CONSUMPTION_REQUEST`
4. 所有金额字段单位为美元

## 相关文件
- `/supabase/migrations/002_functions.sql` - calculate_consumption_data 函数
- `/supabase/functions/send-consumption/index.ts` - 发送逻辑
- `/supabase/functions/process-notifications/index.ts` - 处理通知
- `/web/src/components/Dashboard.tsx` - Web 配置界面

## 参考文档
- [Apple: Send Consumption Information](https://developer.apple.com/documentation/appstoreserverapi/send-consumption-information)
- [Apple: ConsumptionRequest](https://developer.apple.com/documentation/appstoreserverapi/consumptionrequest)