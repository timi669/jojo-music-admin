<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  importLyrics,
  previewLyricImport,
  searchLyricImportSongs,
  type LyricSongCandidate,
  type LyricImportPreviewItem
} from "@/api/system";

defineOptions({ name: "LyricImportDialog" });

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  "update:visible": [visible: boolean];
  success: [];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const files = ref<File[]>([]);
const previewItems = ref<LyricImportPreviewItem[]>([]);
const selectedSongIds = reactive<Record<number, number>>({});
const replaceExisting = reactive<Record<number, boolean>>({});
const manualCandidates = reactive<Record<number, LyricSongCandidate[]>>({});
const manualSearchTerms = reactive<Record<number, string>>({});
const searchingIndex = ref<number | null>(null);
const previewing = ref(false);
const importing = ref(false);
const hasPreview = computed(() => previewItems.value.length > 0);

function clearSelections() {
  Object.keys(selectedSongIds).forEach(
    key => delete selectedSongIds[Number(key)]
  );
  Object.keys(replaceExisting).forEach(
    key => delete replaceExisting[Number(key)]
  );
  Object.keys(manualCandidates).forEach(
    key => delete manualCandidates[Number(key)]
  );
  Object.keys(manualSearchTerms).forEach(
    key => delete manualSearchTerms[Number(key)]
  );
}

function onFilesChanged(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = Array.from(input.files ?? []);
  if (selected.some(file => !file.name.toLowerCase().endsWith(".lrc"))) {
    ElMessage.error("仅支持 .lrc 歌词文件");
    input.value = "";
    return;
  }
  files.value = selected;
  previewItems.value = [];
  clearSelections();
}

async function handlePreview() {
  if (files.value.length === 0) {
    ElMessage.warning("请先选择 LRC 文件");
    return;
  }

  previewing.value = true;
  previewItems.value = [];
  clearSelections();
  try {
    const formData = new FormData();
    files.value.forEach(file => formData.append("files", file, file.name));
    const response = await previewLyricImport(formData);
    if (response.code !== 0 || !response.data) {
      throw new Error(response.message || "歌词匹配预览失败");
    }
    previewItems.value = response.data;
    response.data.forEach(item => {
      if (item.suggestedSongId !== null) {
        selectedSongIds[item.fileIndex] = item.suggestedSongId;
      }
    });
  } catch (error) {
    ElMessage.error(
      error instanceof Error ? error.message : "歌词匹配预览失败"
    );
  } finally {
    previewing.value = false;
  }
}

function candidateFor(item: LyricImportPreviewItem) {
  return candidateOptions(item).find(
    candidate => candidate.songId === selectedSongIds[item.fileIndex]
  );
}

function candidateOptions(item: LyricImportPreviewItem) {
  const candidates = new Map<number, LyricSongCandidate>();
  [...item.candidates, ...(manualCandidates[item.fileIndex] ?? [])].forEach(
    candidate => candidates.set(candidate.songId, candidate)
  );
  return [...candidates.values()];
}

async function searchSongs(item: LyricImportPreviewItem) {
  const keyword =
    manualSearchTerms[item.fileIndex]?.trim() || item.normalizedTitle.trim();
  if (!keyword) {
    ElMessage.warning("请输入歌曲名或歌手名进行搜索");
    return;
  }
  searchingIndex.value = item.fileIndex;
  try {
    const response = await searchLyricImportSongs(keyword);
    if (response.code !== 0 || !response.data) {
      throw new Error(response.message || "搜索歌曲失败");
    }
    manualCandidates[item.fileIndex] = response.data;
    if (response.data.length === 0) {
      ElMessage.info("没有找到歌曲，请调整搜索内容");
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "搜索歌曲失败");
  } finally {
    searchingIndex.value = null;
  }
}

function statusText(status: string) {
  const labels: Record<string, string> = {
    EXACT_MATCH: "歌名与歌手匹配",
    AMBIGUOUS_MATCH: "匹配到多首，请选择",
    TITLE_MATCH_REVIEW_ARTIST: "歌名匹配，请核对歌手",
    NO_MATCH: "没有匹配歌曲"
  };
  return labels[status] ?? "待审核";
}

async function handleImport() {
  const selectedSongIdsForReview = previewItems.value.flatMap(item => {
    const candidate = candidateFor(item);
    return candidate ? [candidate.songId] : [];
  });
  if (
    new Set(selectedSongIdsForReview).size !== selectedSongIdsForReview.length
  ) {
    ElMessage.warning("同一首歌曲不能重复指定歌词，请检查已选择的歌曲");
    return;
  }

  const mappings = previewItems.value.flatMap(item => {
    const songId = selectedSongIds[item.fileIndex];
    const candidate = candidateFor(item);
    if (songId === undefined || !candidate) return [];
    if (candidate.hasLyric && !replaceExisting[item.fileIndex]) return [];
    return [
      {
        fileIndex: item.fileIndex,
        songId,
        replaceExisting:
          candidate.hasLyric && replaceExisting[item.fileIndex] === true,
        manualMatch: !item.candidates.some(
          matchedCandidate => matchedCandidate.songId === songId
        ),
        expectedLyric: candidate.lyricUrl
      }
    ];
  });

  if (mappings.length === 0) {
    ElMessage.warning("没有可导入的匹配项；已有歌词的歌曲需先明确勾选覆盖");
    return;
  }

  const overwrittenCount = mappings.filter(
    mapping => mapping.replaceExisting
  ).length;
  const manualMatchCount = mappings.filter(
    mapping => mapping.manualMatch
  ).length;
  const skippedCount = previewItems.value.length - mappings.length;
  const details = [
    `将上传 ${mappings.length} 份歌词至 MinIO 的 lyrics/ 目录。`,
    manualMatchCount > 0
      ? `其中 ${manualMatchCount} 项为你人工选择的匹配，请确认文件与歌曲对应无误。`
      : "",
    overwrittenCount > 0
      ? `其中 ${overwrittenCount} 首歌曲已有歌词，将按你的勾选替换数据库中的歌词链接；旧对象会保留。`
      : "",
    skippedCount > 0
      ? `另外 ${skippedCount} 个文件因未匹配或未确认覆盖而跳过。`
      : ""
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await ElMessageBox.confirm(details, "确认导入歌词", {
      confirmButtonText: "确认上传并更新",
      cancelButtonText: "返回检查",
      type: overwrittenCount > 0 ? "warning" : "info"
    });
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      ElMessage.error(
        error instanceof Error ? error.message : "确认歌词导入失败"
      );
    }
    return;
  }

  importing.value = true;
  try {
    const formData = new FormData();
    files.value.forEach(file => formData.append("files", file, file.name));
    formData.append("mappings", JSON.stringify(mappings));
    const response = await importLyrics(formData);
    if (response.code !== 0) {
      throw new Error(response.message || "歌词导入失败");
    }
    ElMessage.success(`成功导入 ${response.data} 份歌词`);
    emit("update:visible", false);
    emit("success");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "歌词导入失败");
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    title="批量导入歌词"
    width="920px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="mb-4 flex items-center gap-3">
      <input
        ref="fileInput"
        type="file"
        accept=".lrc"
        multiple
        class="hidden"
        @change="onFilesChanged"
      />
      <el-button @click="fileInput?.click()">选择 LRC 文件</el-button>
      <span class="text-sm text-gray-500">
        已选择 {{ files.length }} 个文件；歌词对象会独立存入 MinIO 的
        lyrics/，不会放进 songs/
      </span>
      <el-button
        type="primary"
        :loading="previewing"
        :disabled="files.length === 0 || importing"
        @click="handlePreview"
      >
        预览匹配
      </el-button>
    </div>

    <div v-if="files.length > 0 && !hasPreview" class="max-h-48 overflow-auto">
      <div
        v-for="file in files"
        :key="`${file.name}-${file.size}-${file.lastModified}`"
        class="truncate py-1 text-sm"
      >
        {{ file.name }}
      </div>
    </div>

    <el-table v-if="hasPreview" :data="previewItems" max-height="480" border>
      <el-table-column label="歌词文件" min-width="200">
        <template #default="{ row }">
          <div class="font-medium">{{ row.filename }}</div>
          <div class="text-xs text-gray-500">
            {{ row.timestampCount }} 个时间标签
          </div>
        </template>
      </el-table-column>
      <el-table-column label="匹配状态" width="160">
        <template #default="{ row }">
          <el-tag
            :type="row.matchStatus === 'EXACT_MATCH' ? 'success' : 'warning'"
          >
            {{ statusText(row.matchStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="目标歌曲" min-width="280">
        <template #default="{ row }">
          <el-select
            v-if="candidateOptions(row).length"
            v-model="selectedSongIds[row.fileIndex]"
            placeholder="选择歌曲"
            class="w-full"
            @change="replaceExisting[row.fileIndex] = false"
          >
            <el-option
              v-for="candidate in candidateOptions(row)"
              :key="candidate.songId"
              :value="candidate.songId"
              :label="`${candidate.songName} — ${candidate.artistCredits || candidate.artistName || '未知歌手'}`"
            />
          </el-select>
          <span v-else class="text-sm text-red-500"
            >没有自动匹配，请使用人工搜索</span
          >
          <div class="mt-2 flex gap-2">
            <el-input
              v-model="manualSearchTerms[row.fileIndex]"
              :placeholder="`搜索歌曲名或歌手名（默认：${row.normalizedTitle}）`"
              @keyup.enter="searchSongs(row)"
            />
            <el-button
              :loading="searchingIndex === row.fileIndex"
              @click="searchSongs(row)"
            >
              人工搜索
            </el-button>
          </div>
          <div v-if="candidateFor(row)?.hasLyric" class="mt-2">
            <el-checkbox v-model="replaceExisting[row.fileIndex]">
              覆盖现有歌词链接（旧歌词文件会保留）
            </el-checkbox>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button :disabled="importing" @click="emit('update:visible', false)">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="importing"
        :disabled="!hasPreview || previewing"
        @click="handleImport"
      >
        确认导入已审核项目
      </el-button>
    </template>
  </el-dialog>
</template>
