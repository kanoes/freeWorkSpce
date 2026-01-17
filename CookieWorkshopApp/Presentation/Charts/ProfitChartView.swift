import SwiftUI
import Charts

struct ProfitChartView: View {
    
    let data: [ChartDataPoint]
    
    var body: some View {
        if data.isEmpty {
            EmptyStateView(
                icon: "📈",
                title: "暂无数据",
                description: "开始记录后这里会显示收益趋势"
            )
        } else {
            Chart(data) { point in
                LineMark(
                    x: .value("日期", point.label),
                    y: .value("收益", point.value)
                )
                .foregroundStyle(lineColor)
                .interpolationMethod(.catmullRom)
                
                AreaMark(
                    x: .value("日期", point.label),
                    y: .value("收益", point.value)
                )
                .foregroundStyle(areaGradient)
                .interpolationMethod(.catmullRom)
            }
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 5)) { value in
                    AxisValueLabel()
                        .foregroundStyle(AppColors.mutedDark)
                        .font(.caption)
                }
            }
            .chartYAxis {
                AxisMarks { value in
                    AxisGridLine()
                        .foregroundStyle(AppColors.mutedDark.opacity(0.2))
                    AxisValueLabel()
                        .foregroundStyle(AppColors.mutedDark)
                        .font(.caption)
                }
            }
        }
    }
    
    private var lineColor: Color {
        guard let lastValue = data.last?.value else { return AppColors.primary }
        return lastValue >= 0 ? AppColors.success : AppColors.danger
    }
    
    private var areaGradient: LinearGradient {
        let color = lineColor
        return LinearGradient(
            colors: [color.opacity(0.3), color.opacity(0)],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}

