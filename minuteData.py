import sys
import os
import tushare as ts
import time

import datetime  # Add this import at the top

def is_trading_time():
    now = datetime.datetime.now().time()
    morning_start = datetime.time(9, 30)
    morning_end = datetime.time(11, 30)
    afternoon_start = datetime.time(12, 59)
    afternoon_end = datetime.time(15, 0)
    return (morning_start <= now <= morning_end) or (afternoon_start <= now <= afternoon_end)

ts_code = '600845.SH,603730.SH,600690.SH,600027.SH,600312.SH,600905.SH,600150.SH,600938.SH,600089.SH,002236.SZ,002832.SZ,601233.SH,600348.SH,000983.SZ,600373.SH,601928.SH,603393.SH,002938.SZ,000729.SZ,000921.SZ,600233.SH,600886.SH,601872.SH,600026.SH,000913.SZ,002048.SZ,000768.SZ,002737.SZ,00332.SH,601989.SH,601231.SH,601288.SH,00876.SZ,603027.SH,600489.SH,603993.SH,600361.SH'
quoteCache = set()

while True:
  try:
    if not is_trading_time():
      print("当前时间不在交易时段内，等待1分钟...")
      time.sleep(60)
      continue

    df = ts.realtime_quote(ts_code=ts_code)

    for _, row in df.iterrows():
      stock_name = row['TS_CODE']
      filename = f"{stock_name}_quote.txt"

      # 提取时间价格数据
      key = stock_name + row['TIME']
      if key not in quoteCache:
        quoteCache.add(key)
        csv_line = f"{row['TIME']}, {row['PRICE']}\n"

        # 检查文件是否存在
        write_header = not os.path.exists(filename)

        with open(filename, 'a', encoding='utf-8', newline='\n') as f:
            # 写入表头（如果需要）
            if write_header:
                f.write("时间, 现价(元)\n")
            # 追加数据行
            f.write(csv_line)
            print(f"数据已追加到 {filename}")

    # 等待5分钟（300秒）
    print("等待1分钟后再次执行...")
    time.sleep(60)

  except Exception as e:
      print(f"操作失败：{str(e)}")
      sys.exit(1)