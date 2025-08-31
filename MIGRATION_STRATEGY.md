# Migration Strategy - 迁移策略

## 基线重置 (2025-08-31)

我们已经重置了迁移基线，采用全新的迁移管理策略。

### 目录结构

```
supabase/
├── migrations/                    # 新的迁移文件（从基线开始）
│   └── 20250831100000_baseline.sql  # 基线文件（需要生成）
├── migrations-archive/            # 归档的历史迁移文件（仅供参考）
│   ├── 001_schema.sql
│   ├── 002_functions.sql
│   └── ... (39个历史文件)
```

### 立即行动：生成基线文件

**重要**：你需要运行以下命令之一来生成实际的基线文件：

```bash
# 方法1：如果你有数据库密码
supabase db dump --schema public -f supabase/migrations/20250831100000_baseline.sql --password YOUR_PASSWORD

# 方法2：如果项目已链接
supabase db dump --schema public -f supabase/migrations/20250831100000_baseline.sql

# 方法3：运行导出脚本查看更多选项
./export_baseline.sh
```

### 新的工作流程

从今天开始，所有数据库更改必须遵循以下流程：

1. **创建迁移文件**
   ```bash
   # 使用时间戳格式：YYYYMMDDHHMMSS_description.sql
   # 例如：20250831150000_add_user_preferences.sql
   ```

2. **本地测试**
   ```bash
   supabase db reset  # 重置本地数据库
   supabase migration up  # 应用迁移
   ```

3. **部署到生产**
   ```bash
   supabase migration up --db-url YOUR_PRODUCTION_URL
   ```

### 重要原则

1. **不再通过 Supabase MCP 直接修改数据库**
   - 所有更改必须通过迁移文件
   - 这确保所有环境保持同步

2. **迁移文件命名规范**
   - 格式：`YYYYMMDDHHMMSS_descriptive_name.sql`
   - 使用下划线分隔单词
   - 保持描述简洁明了

3. **定期基线重置**
   - 每季度或每个主要版本后
   - 合并所有迁移到新的基线
   - 归档旧的迁移文件

### 部署场景

#### 新环境部署
```bash
# 1. 克隆仓库
git clone your-repo

# 2. 初始化 Supabase
supabase init

# 3. 应用基线和后续迁移
supabase db reset
```

#### 现有环境更新
```bash
# 1. 拉取最新代码
git pull

# 2. 应用新迁移
supabase migration up
```

### 故障排除

如果遇到迁移问题：

1. **检查迁移状态**
   ```sql
   SELECT * FROM supabase_migrations.schema_migrations 
   ORDER BY version DESC;
   ```

2. **回滚迁移**（谨慎使用）
   ```bash
   supabase migration down
   ```

3. **紧急修复**
   - 创建修复迁移文件
   - 不要直接修改数据库
   - 记录所有更改

### 历史参考

归档的迁移文件保存在 `migrations-archive/` 目录中，包含了项目从开始到基线重置期间的所有数据库更改历史。这些文件：
- 仅供参考和审计
- 不会被执行
- 包含了实现细节和修复历史

### 联系方式

如有问题，请联系项目维护者。