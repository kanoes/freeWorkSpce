# 甜饼工坊 iOS 重构计划

## 目标

把现有「甜饼工坊（Web/PWA）」重构为「真正的 iOS 原生 App（SwiftUI）」并支持：
- Sign in with Apple 登录
- 多设备数据同步（离线优先）
- 结构清晰、可维护、可拓展
- 计算口径与现有 Web 版本一致（持仓、已实现损益、排行、月度等）

额外硬性约束：
- 全项目不写任何注释（包含 `//`、`/* */`、`///`、文档注释、TODO/FIXME、注释掉的代码）
- 依靠清晰的命名、模块划分、类型系统、测试来表达意图，而不是注释

---

## 技术选型（固定）

- iOS：SwiftUI + Swift Concurrency
- 本地存储：SQLite + GRDB
- 登录与云同步：Supabase（Auth + Postgres + RLS）
- 图表：Swift Charts（优先）
- 构建目标：iOS 17+（可按团队标准微调）

---

## 项目结构已完成

```
CookieWorkshopApp/
├── App/
│   ├── CookieWorkshopApp.swift          ✅ 应用入口
│   ├── AppEnvironment.swift             ✅ 依赖注入容器
│   └── AppRouter.swift                  ✅ 导航管理
├── Presentation/
│   ├── Screens/
│   │   ├── Home/
│   │   │   ├── HomeView.swift           ✅ 主页视图
│   │   │   └── HomeViewModel.swift      ✅ 主页视图模型
│   │   ├── DayEditor/
│   │   │   ├── DayEditorView.swift      ✅ 日记编辑器
│   │   │   └── DayEditorViewModel.swift ✅ 编辑器视图模型
│   │   ├── Analysis/
│   │   │   ├── AnalysisView.swift       ✅ 数据分析页
│   │   │   └── AnalysisViewModel.swift  ✅ 分析视图模型
│   │   ├── Dividend/
│   │   │   ├── DividendView.swift       ✅ 分红页面
│   │   │   └── DividendViewModel.swift  ✅ 分红视图模型
│   │   ├── Settings/
│   │   │   ├── SettingsView.swift       ✅ 设置页面
│   │   │   └── SettingsViewModel.swift  ✅ 设置视图模型
│   │   └── Auth/
│   │       └── SignInView.swift         ✅ 登录页面
│   ├── Components/
│   │   ├── CardView.swift               ✅ 卡片组件
│   │   ├── MoneyText.swift              ✅ 金额显示
│   │   ├── SummaryCardView.swift        ✅ 摘要卡片
│   │   ├── EmptyStateView.swift         ✅ 空状态
│   │   ├── PrimaryButton.swift          ✅ 按钮组件
│   │   └── TradeTagView.swift           ✅ 交易标签
│   ├── Charts/
│   │   └── ProfitChartView.swift        ✅ 收益图表
│   └── DesignSystem/
│       ├── Colors.swift                 ✅ 颜色系统
│       ├── Typography.swift             ✅ 字体系统
│       └── Spacing.swift                ✅ 间距系统
├── Application/
│   ├── UseCases/
│   │   ├── AddOrUpdateTradeDayUseCase.swift  ✅
│   │   ├── DeleteTradeDayUseCase.swift       ✅
│   │   ├── FetchTradeDaysUseCase.swift       ✅
│   │   ├── ImportFromJSONUseCase.swift       ✅
│   │   ├── ExportToJSONUseCase.swift         ✅
│   │   ├── SyncNowUseCase.swift              ✅
│   │   └── ClearAllDataUseCase.swift         ✅
│   ├── Sync/
│   │   └── SyncEngine.swift             ✅ 同步引擎
│   └── State/
│       └── AppState.swift               ✅ 应用状态
├── Domain/
│   ├── Models/
│   │   ├── TradeAction.swift            ✅ 交易动作枚举
│   │   ├── Market.swift                 ✅ 市场枚举
│   │   ├── Money.swift                  ✅ 金额值对象
│   │   ├── Trade.swift                  ✅ 交易模型
│   │   ├── TradeDay.swift               ✅ 交易日模型
│   │   ├── LocalDate.swift              ✅ 本地日期
│   │   ├── Holding.swift                ✅ 持仓模型
│   │   ├── SyncState.swift              ✅ 同步状态
│   │   ├── DividendRatio.swift          ✅ 分红比例
│   │   └── Company.swift                ✅ 公司信息
│   ├── Services/
│   │   └── CompanyLookupService.swift   ✅ 公司查询服务
│   ├── Calculators/
│   │   ├── HoldingsCalculator.swift     ✅ 持仓计算器
│   │   ├── ProfitCalculator.swift       ✅ 损益计算器
│   │   ├── StockRankingCalculator.swift ✅ 排行计算器
│   │   ├── DividendCalculator.swift     ✅ 分红计算器
│   │   ├── TradingStatsCalculator.swift ✅ 统计计算器
│   │   └── BestWorstDayCalculator.swift ✅ 最佳最差日计算器
│   └── Validators/
│       ├── TradeValidator.swift         ✅ 交易验证器
│       └── TradeDayValidator.swift      ✅ 交易日验证器
├── Infrastructure/
│   ├── Persistence/
│   │   ├── Database/
│   │   │   ├── DatabaseManager.swift    ✅ 数据库管理
│   │   │   ├── TradeDayRecord.swift     ✅ 交易日记录
│   │   │   └── KeyValueRecord.swift     ✅ 键值记录
│   │   └── Repositories/
│   │       ├── TradeDayRepositoryProtocol.swift ✅
│   │       ├── TradeDayRepository.swift ✅
│   │       └── KeyValueRepository.swift ✅
│   ├── Cloud/
│   │   ├── Supabase/
│   │   │   ├── SupabaseClient.swift     ✅ Supabase 客户端
│   │   │   ├── TradeDayRemoteDataSource.swift ✅
│   │   │   └── AuthService.swift        ✅ 认证服务
│   │   └── DTO/
│   │       └── TradeDayDTO.swift        ✅ 数据传输对象
│   └── Security/
│       └── Keychain/
│           └── KeychainManager.swift    ✅ 钥匙串管理
└── Tests/
    ├── DomainTests/
    │   ├── HoldingsCalculatorTests.swift   ✅
    │   ├── ProfitCalculatorTests.swift     ✅
    │   ├── DividendCalculatorTests.swift   ✅
    │   ├── StockRankingCalculatorTests.swift ✅
    │   ├── MoneyTests.swift                ✅
    │   └── LocalDateTests.swift            ✅
    ├── SyncTests/
    │   └── SyncEngineTests.swift           ✅
    └── PersistenceTests/
        └── TradeDayRecordTests.swift       ✅
```

---

## 里程碑进度

### Milestone 0：脚手架与规范落地 ✅
- [x] 初始化 iOS 工程结构
- [x] 接入 SwiftLint/SwiftFormat 配置
- [x] 配置"无注释扫描"规则
- [x] Package.swift 依赖配置

### Milestone 1：Domain 完成（对齐 Web 口径）✅
- [x] Models 完成
- [x] Calculators 完成
- [x] 单元测试覆盖关键口径
- [x] 计算逻辑与 Web 版本一致

### Milestone 2：本地数据库完成（离线全功能）✅
- [x] GRDB schema + migrations
- [x] Repository 完整
- [x] 记录的 CRUD 操作
- [x] 同步状态标记

### Milestone 3：Supabase Auth + 同步 ✅
- [x] Sign in with Apple 集成
- [x] trade_days 表 DTO
- [x] SyncEngine（push/pull）完成
- [x] 冲突解决策略（LWW）

### Milestone 4：UI 复刻与体验打磨 ✅
- [x] Home 页面
- [x] DayEditor 页面
- [x] Analysis 页面
- [x] Dividend 页面
- [x] Settings 页面
- [x] 图表实现（Swift Charts）

### Milestone 5：可上架准备 🔄
- [ ] Xcode 项目配置
- [ ] 隐私说明、权限声明
- [ ] 数据导出/删除账号数据流程
- [ ] TestFlight 构建

---

## 核心计算逻辑说明

### 持仓计算（与 Web 一致）
1. 按日期排序所有交易日
2. 每天先处理所有买入，再处理所有卖出
3. 买入增加持仓数量和总成本
4. 卖出按平均成本计算成本基础
5. 清仓后移除该股票的持仓记录

### 已实现损益计算（与 Web 一致）
1. 获取当天之前的持仓状态
2. 先处理当天所有买入（更新持仓）
3. 再处理当天所有卖出
4. 每笔卖出：收入 - 成本基础 = 该笔损益
5. 累加所有卖出损益 = 当日损益

### 分红计算（与 Web 一致）
- 盈利时：ceil(profit × ratio × 0.8)
- 亏损时：floor(profit × ratio)

---

## 下一步行动

1. 在 Xcode 中创建实际项目
2. 配置 Supabase 项目和 RLS 策略
3. 添加 Sign in with Apple 能力
4. 完善 UI 细节和动画
5. 进行真机测试
6. 提交 TestFlight

