<script setup lang="ts">
import {
  computed,
  ref,
  defineProps,
  defineEmits,
  onBeforeUnmount,
  watch
} from "vue";
import { updateSongAudio } from "@/api/system";
import { message } from "@/utils/message";
import UploadIcon from "@iconify-icons/ri/upload-2-line";

const props = defineProps({ songId: Number, visible: Boolean });
const emit = defineEmits(["update:visible", "success"]);

const fileList = ref([]);
const isVisible = ref(props.visible);
const audioUrl = ref(""); // 存储音频预览URL
const duration = ref(""); // 音频时长，格式化后字符串
const previewUnsupported = ref(false);
const isSubmitting = ref(false);
const compatibilityWarning = computed(() => {
  const filename = fileList.value[0]?.name?.toLowerCase() ?? "";
  return /\.(m4a|aac)$/.test(filename);
});

const releaseAudioUrl = () => {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value);
    audioUrl.value = "";
  }
};

onBeforeUnmount(releaseAudioUrl);

watch(
  () => props.visible,
  newVal => {
    isVisible.value = newVal;
  }
);

const handleChange = file => {
  const selectedFile = file.raw;
  if (!selectedFile) return;
  const extension = selectedFile.name.split(".").pop()?.toLowerCase();
  if (!["mp3", "flac", "m4a", "aac"].includes(extension)) {
    message("仅支持 MP3、FLAC、M4A 和 AAC 音频文件", { type: "warning" });
    fileList.value = [];
    releaseAudioUrl();
    duration.value = "";
    previewUnsupported.value = false;
    return;
  }

  fileList.value = [selectedFile]; // 只允许上传一个文件，替换掉之前的
  // 创建音频预览 URL
  releaseAudioUrl();
  audioUrl.value = URL.createObjectURL(selectedFile);
  duration.value = ""; // 重置时长，等待新的元数据加载
  previewUnsupported.value = false;
};

const handleLoadedMetadata = (event: Event) => {
  const audioElement = event.target as HTMLAudioElement;
  const seconds = audioElement.duration;

  if (Number.isFinite(seconds)) {
    duration.value = seconds.toFixed(2);
  } else {
    duration.value = "";
    message("音频时长解析失败", { type: "warning" });
  }
};

const handlePreviewError = () => {
  previewUnsupported.value = true;
  duration.value = "";
};

const submitForm = async () => {
  if (!fileList.value.length) {
    message("请先选择一个音频文件", { type: "warning" });
    return;
  }

  const formData = new FormData();
  formData.append("audio", fileList.value[0]);

  isSubmitting.value = true;
  try {
    const res = await updateSongAudio(props.songId, formData);
    if (res.code === 0) {
      const validatedAudio = res.data;
      const validationSummary =
        validatedAudio &&
        typeof validatedAudio === "object" &&
        "detectedFormat" in validatedAudio
          ? `校验通过：${validatedAudio.detectedFormat}，${validatedAudio.durationSeconds.toFixed(2)} 秒。`
          : "";
      const resultMessage = [validationSummary, res.message]
        .filter(Boolean)
        .join(" ");
      message(resultMessage || "上传成功", {
        type: res.message?.includes("兼容性提示") ? "warning" : "success"
      });
      emit("update:visible", false);
      emit("success");
    } else {
      message(res.message || "上传失败", { type: "error" });
    }
  } catch (error) {
    console.error("上传失败:", error);
    message("上传失败，请重试", { type: "error" });
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <el-dialog
    v-model="isVisible"
    title="上传音频"
    @close="emit('update:visible', false)"
  >
    <el-upload
      :file-list="fileList"
      :auto-upload="false"
      :limit="1"
      action="#"
      drag
      accept=".mp3,.flac,.m4a,.aac"
      @change="handleChange"
    >
      <div class="el-upload__text">
        <IconifyIconOffline :icon="UploadIcon" width="26" class="m-auto mb-2" />
        点击或拖拽上传（支持 MP3、FLAC、M4A、AAC）
      </div>
    </el-upload>
    <el-alert
      v-if="compatibilityWarning"
      class="mt-3"
      type="warning"
      :closable="false"
      title="M4A/AAC 在部分 Chromium/Electron 浏览器（包括某些 VS Code 内置浏览器）可能无法播放。建议优先使用 MP3；仍可继续上传。"
    />
    <el-alert
      v-if="previewUnsupported"
      class="mt-3"
      type="warning"
      :closable="false"
      title="当前管理端浏览器无法预览此音频；仍可提交，服务端会先识别格式并完整解码，校验通过后才会导入。"
    />
    <audio
      v-if="audioUrl"
      :src="audioUrl"
      controls
      class="mt-3"
      @loadedmetadata="handleLoadedMetadata"
      @error="handlePreviewError"
    />
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="isSubmitting" @click="submitForm"
        >提交</el-button
      >
    </template>
  </el-dialog>
</template>

<style scoped></style>
