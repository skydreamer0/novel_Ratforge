import os
import glob

def count_words(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            # Count non-whitespace characters
            count = len(''.join(content.split()))
            return count
    except Exception as e:
        return -1

directory = r"d:\專案\novel_Ratforge\章稿\第9卷_墜落地"
files = glob.glob(os.path.join(directory, "*.md"))

print(f"Checking {len(files)} files in {directory}...\n")

results = []
for file in files:
    count = count_words(file)
    results.append((os.path.basename(file), count))

# Sort by word count (ascending) to highlight the shortest chapters
results.sort(key=lambda x: x[1])

print(f"{'Filename':<30} | {'Count':<10} | {'Status'}")
print("-" * 55)
for name, count in results:
    status = "OK" if count >= 3000 else "LOW"
    print(f"{name:<30} | {count:<10} | {status}")
