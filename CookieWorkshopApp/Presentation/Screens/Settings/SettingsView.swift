import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    
    @StateObject private var viewModel: SettingsViewModel
    @Environment(\.dismiss) private var dismiss
    
    @State private var showingExporter = false
    @State private var showingImporter = false
    @State private var showingClearConfirmation = false
    @State private var exportData: Data?
    
    init(viewModel: SettingsViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: AppSpacing.sectionSpacing) {
                    exportSection
                    importSection
                    dangerSection
                    footerSection
                }
                .padding(AppSpacing.screenPadding)
            }
            .background(AppColors.backgroundDark.ignoresSafeArea())
            .navigationTitle("设置")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") {
                        dismiss()
                    }
                    .foregroundStyle(AppColors.textDark)
                }
            }
            .fileExporter(
                isPresented: $showingExporter,
                document: JSONDocument(data: exportData ?? Data()),
                contentType: .json,
                defaultFilename: "甜饼工坊-backup-\(LocalDate.today.isoString).json"
            ) { _ in }
            .fileImporter(
                isPresented: $showingImporter,
                allowedContentTypes: [.json]
            ) { result in
                Task {
                    await viewModel.handleImport(result: result)
                }
            }
            .alert("清空所有数据", isPresented: $showingClearConfirmation) {
                Button("取消", role: .cancel) {}
                Button("清空", role: .destructive) {
                    Task {
                        await viewModel.clearAllData()
                    }
                }
            } message: {
                Text("此操作不可撤销！")
            }
        }
    }
    
    private var exportSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("导出数据")
                
                SettingsRowView(
                    icon: "💾",
                    title: "下载 JSON 文件",
                    description: "保存备份文件到设备"
                ) {
                    Task {
                        exportData = await viewModel.exportData()
                        showingExporter = true
                    }
                }
                
                SettingsRowView(
                    icon: "📋",
                    title: "复制到剪贴板",
                    description: "复制数据文本方便分享"
                ) {
                    Task {
                        await viewModel.copyToClipboard()
                    }
                }
            }
        }
    }
    
    private var importSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("导入数据")
                
                SettingsRowView(
                    icon: "📂",
                    title: "从文件导入",
                    description: "选择 JSON 备份文件"
                ) {
                    showingImporter = true
                }
            }
        }
    }
    
    private var dangerSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: AppSpacing.md) {
                CardHeaderView("危险操作")
                
                SettingsRowView(
                    icon: "🗑️",
                    title: "清空所有数据",
                    description: "此操作不可撤销",
                    isDanger: true
                ) {
                    showingClearConfirmation = true
                }
            }
        }
    }
    
    private var footerSection: some View {
        VStack(spacing: AppSpacing.xs) {
            Text("甜饼工坊 v3.0")
                .appCaption()
                .foregroundStyle(AppColors.mutedDark)
            
            Text("数据仅保存在本地设备")
                .appCaption()
                .foregroundStyle(AppColors.mutedDark)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, AppSpacing.lg)
    }
}

struct SettingsRowView: View {
    
    let icon: String
    let title: String
    let description: String
    var isDanger: Bool = false
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: AppSpacing.md) {
                Text(icon)
                    .font(.system(size: 24))
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .appSubheadline()
                        .foregroundStyle(isDanger ? AppColors.danger : AppColors.textDark)
                    
                    Text(description)
                        .appCaption()
                        .foregroundStyle(AppColors.mutedDark)
                }
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .foregroundStyle(AppColors.mutedDark)
            }
            .padding(AppSpacing.sm)
            .background(
                RoundedRectangle(cornerRadius: AppSpacing.cornerRadiusSmall)
                    .fill(AppColors.cardDark.opacity(0.5))
            )
        }
        .buttonStyle(.plain)
    }
}

struct JSONDocument: FileDocument {
    
    static var readableContentTypes: [UTType] { [.json] }
    
    var data: Data
    
    init(data: Data) {
        self.data = data
    }
    
    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }
    
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

