import sys
import os
import tushare as ts

# 从命令行参数获取股票代码
if len(sys.argv) < 2:
  print("Usage: python tickData.py <ts_code> (多个代码用逗号分隔)")
  print("Example: python tickData.py 000625.SZ,600000.SH")
  sys.exit(1)

ts_code = sys.argv[1]  # 从命令行参数获取股票代码

try:
  # 实时成交
  for tsCode in ts_code.split(','):
    df = ts.realtime_tick(ts_code=tsCode)
    csv_line = ''
    filename = f"{ts_code}_tick.txt"
    for _, row in df.iterrows():
        tickType = row['TYPE']
        if tickType == '买盘':
          tickType = 'B'
        elif tickType == '卖盘':
          tickType = 'S'
        else:
          tickType = 'N'

        time_str = row['TIME']
        hour_part = time_str.split(':', 1)[0]
        hour = int(hour_part)
        if hour >= 14:
          # 处理时间字符串
          if time_str.startswith('14:'):
            new_time = time_str[3:]  # 移除"14:"前缀
          else:
            new_time = time_str
      
        # 提取时间价格数据
        csv_line = f"{csv_line}\n{new_time},{row['PRICE']},{row['VOLUME']},{tickType}\n"

    with open(filename, 'w', encoding='utf-8', newline='\n') as f:
      # 追加数据行
      f.write(csv_line)
      print(f"数据已追加到 {filename}")

except Exception as e:
  print(f"操作失败：{str(e)}")
  sys.exit(1)