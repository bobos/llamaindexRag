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
      for _, row in df.iterrows():
          stock_name = tsCode 
          filename = f"{stock_name}_tick.txt"
          
          tickType = row['TYPE']
          if tickType == '买盘':
            tickType = 'B'
          elif tickType == '卖盘':
            tickType = 'S'
          else:
            tickType = 'N'
          # 提取时间价格数据
          csv_line = f"{row['TIME']},{row['PRICE']},{row['VOLUME']},{tickType}\n"
          
          # 检查文件是否存在
          write_header = not os.path.exists(filename)
          
          with open(filename, 'a', encoding='utf-8', newline='\n') as f:
              # 写入表头（如果需要）
              if write_header:
                  f.write("时间,价格(元),成交量,成交类型(B买盘/S卖盘/中性盘N)\n")
              # 追加数据行
              f.write(csv_line)
              print(f"数据已追加到 {filename}")

except Exception as e:
    print(f"操作失败：{str(e)}")
    sys.exit(1)