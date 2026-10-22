<script setup lang="ts">
import { ref } from "vue";
import { ElMessageBox } from "element-plus";
import { useArtist } from "./utils/hook";
import { PureTableBar } from "@/components/RePureTableBar";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import {
  getArtistProfileEnrichmentStatus,
  startArtistProfileEnrichment,
  type ArtistProfileEnrichmentStatus
} from "@/api/system";

import Upload from "@iconify-icons/ri/upload-line";
import More from "@iconify-icons/ep/more-filled";
import Delete from "@iconify-icons/ep/delete";
import EditPen from "@iconify-icons/ep/edit-pen";
import Refresh from "@iconify-icons/ep/refresh";
import AddFill from "@iconify-icons/ri/add-circle-line";

defineOptions({
  name: "ArtistManagement"
});

const formRef = ref();
const tableRef = ref();
const enrichingProfiles = ref(false);
const enrichmentStatus = ref<ArtistProfileEnrichmentStatus | null>(null);

const {
  form,
  loading,
  columns,
  dataList,
  selectedNum,
  pagination,
  buttonClass,
  deviceDetection,
  onSearch,
  resetForm,
  onbatchDel,
  openDialog,
  handleUpdate,
  handleDelete,
  handleUpload,
  handleSizeChange,
  onSelectionCancel,
  handleCurrentChange,
  handleSelectionChange
} = useArtist(tableRef);

const waitForStatus = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

async function handleEnrichProfiles() {
  try {
    await ElMessageBox.confirm(
      "系统会扫描歌曲引用的 MinIO MP3/FLAC 音频标签，按规范化姓名去重后只新建歌手库中不存在的艺人；随后通过 MusicBrainz 唯一精确匹配，并优先从中文维基/Wikidata补充简介、头像、性别和国籍。已有头像会保留，无法可靠匹配的条目会跳过并列出原因。",
      "自动补全歌手资料",
      { confirmButtonText: "开始补全", cancelButtonText: "取消", type: "info" }
    );
  } catch (error) {
    if (error !== "cancel" && error !== "close") {
      console.error("确认歌手资料补全失败：", error);
      message("无法启动歌手资料补全", { type: "error" });
    }
    return;
  }

  enrichingProfiles.value = true;
  try {
    const started = await startArtistProfileEnrichment();
    if (started.code !== 0 || !started.data) {
      throw new Error(started.message || "无法启动歌手资料补全");
    }
    enrichmentStatus.value = started.data as ArtistProfileEnrichmentStatus;

    while (enrichmentStatus.value.state === "running") {
      await waitForStatus(1500);
      const response = await getArtistProfileEnrichmentStatus();
      if (response.code !== 0 || !response.data) {
        throw new Error(response.message || "无法获取歌手资料补全进度");
      }
      enrichmentStatus.value = response.data as ArtistProfileEnrichmentStatus;
    }

    await onSearch();
    const status = enrichmentStatus.value;
    if (!status) {
      throw new Error("歌手资料补全任务没有返回状态");
    }
    const summary =
      `扫描 ${status.audioFilesScanned} 个音频文件，识别 ${status.uniqueArtistsFound} 个艺人名，新建 ${status.artistsAdded} 位、关联歌曲 ${status.songLinksAdded} 条；` +
      `处理 ${status.processed}/${status.total} 位歌手；` +
      `更新头像 ${status.avatarsAdded} 张、简介 ${status.introductionsAdded} 条、性别 ${status.gendersAdded} 条、国籍 ${status.areasAdded} 条；` +
      `跳过 ${status.skipped} 位，失败 ${status.failed} 位。`;
    message(summary, {
      type:
        status.state === "failed" || status.failed > 0 ? "warning" : "success"
    });
    if (status.issues.length > 0 || status.omittedIssues > 0) {
      const issueText = [
        ...status.issues,
        ...(status.omittedIssues > 0
          ? [`另有 ${status.omittedIssues} 条未显示，请重试或检查服务日志。`]
          : [])
      ].join("\n");
      await ElMessageBox.alert(issueText, "未自动补全的歌手", {
        confirmButtonText: "知道了",
        type:
          status.state === "failed" || status.failed > 0 ? "warning" : "info"
      });
    }
  } catch (error) {
    console.error("自动补全歌手资料失败：", error);
    message(
      error instanceof Error
        ? error.message
        : "自动补全歌手资料失败，请稍后重试",
      { type: "error" }
    );
  } finally {
    enrichingProfiles.value = false;
  }
}
</script>

<template>
  <div :class="['flex', 'justify-between', deviceDetection() && 'flex-wrap']">
    <div
      :class="[deviceDetection() ? ['w-full', 'mt-2'] : 'w-[calc(100%-0px)]']"
    >
      <el-form
        ref="formRef"
        :inline="true"
        :model="form"
        class="search-form bg-bg_color w-[99/100] pl-8 pt-[12px] overflow-auto"
      >
        <el-form-item label="歌手：" prop="artistName">
          <el-input
            v-model="form.artistName"
            placeholder="请输入歌手"
            clearable
            class="!w-[180px]"
          />
        </el-form-item>
        <el-form-item label="国籍：" prop="area">
          <el-input
            v-model="form.area"
            placeholder="请输入国籍"
            clearable
            class="!w-[180px]"
          />
        </el-form-item>
        <el-form-item label="类型：" prop="gender">
          <el-select
            v-model="form.gender"
            placeholder="请选择"
            clearable
            class="!w-[180px]"
          >
            <el-option label="男歌手" value="0" />
            <el-option label="女歌手" value="1" />
            <el-option label="组合/乐队" value="2" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :icon="useRenderIcon('ri:search-line')"
            :loading="loading"
            @click="onSearch"
          >
            搜索
          </el-button>
          <el-button :icon="useRenderIcon(Refresh)" @click="resetForm(formRef)">
            重置
          </el-button>
        </el-form-item>
      </el-form>

      <PureTableBar title="歌手管理" :columns="columns" @refresh="onSearch">
        <template #buttons>
          <el-button
            type="success"
            :loading="enrichingProfiles"
            :disabled="enrichingProfiles"
            @click="handleEnrichProfiles"
          >
            {{
              enrichingProfiles && enrichmentStatus
                ? enrichmentStatus.audioSongsProcessed < enrichmentStatus.audioSongsTotal
                  ? `扫描音频 ${enrichmentStatus.audioSongsProcessed}/${enrichmentStatus.audioSongsTotal}`
                  : `补全中 ${enrichmentStatus.processed}/${enrichmentStatus.total}`
                : "自动补全缺失资料"
            }}
          </el-button>
          <el-button
            type="primary"
            :icon="useRenderIcon(AddFill)"
            @click="openDialog()"
          >
            新增歌手
          </el-button>
        </template>
        <template v-slot="{ size, dynamicColumns }">
          <div
            v-if="selectedNum > 0"
            v-motion-fade
            class="bg-[var(--el-fill-color-light)] w-full h-[46px] mb-2 pl-4 flex items-center"
          >
            <div class="flex-auto">
              <span
                style="font-size: var(--el-font-size-base)"
                class="text-[rgba(42,46,54,0.5)] dark:text-[rgba(220,220,242,0.5)]"
              >
                已选 {{ selectedNum }} 项
              </span>
              <el-button type="primary" text @click="onSelectionCancel">
                取消选择
              </el-button>
            </div>
            <el-popconfirm title="是否确认删除?" @confirm="onbatchDel">
              <template #reference>
                <el-button type="danger" text class="mr-1">
                  批量删除
                </el-button>
              </template>
            </el-popconfirm>
          </div>
          <pure-table
            ref="tableRef"
            row-key="artistId"
            adaptive
            :adaptiveConfig="{ offsetBottom: 108 }"
            align-whole="center"
            table-layout="auto"
            :loading="loading"
            :size="size"
            :data="dataList"
            :columns="dynamicColumns"
            :pagination="{ ...pagination, size }"
            :header-cell-style="{
              background: 'var(--el-fill-color-light)',
              color: 'var(--el-text-color-primary)'
            }"
            @selection-change="handleSelectionChange"
            @page-size-change="handleSizeChange"
            @page-current-change="handleCurrentChange"
          >
            <template #operation="{ row }">
              <el-button
                class="reset-margin"
                link
                type="primary"
                :size="size"
                :icon="useRenderIcon(EditPen)"
                @click="openDialog('修改', row)"
              >
                修改
              </el-button>
              <el-popconfirm
                :title="`是否确认删除歌手编号为 ${row.artistId} 的这条数据`"
                @confirm="handleDelete(row)"
              >
                <template #reference>
                  <el-button
                    class="reset-margin"
                    link
                    type="primary"
                    :size="size"
                    :icon="useRenderIcon(Delete)"
                  >
                    删除
                  </el-button>
                </template>
              </el-popconfirm>
              <el-dropdown>
                <el-button
                  class="ml-3 mt-[2px]"
                  link
                  type="primary"
                  :size="size"
                  :icon="useRenderIcon(More)"
                  @click="handleUpdate(row)"
                />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item>
                      <el-button
                        :class="buttonClass"
                        link
                        type="primary"
                        :size="size"
                        :icon="useRenderIcon(Upload)"
                        @click="handleUpload(row)"
                      >
                        上传头像
                      </el-button>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </pure-table>
        </template>
      </PureTableBar>
    </div>
  </div>
</template>

<style scoped lang="scss">
:deep(.el-dropdown-menu__item i) {
  margin: 0;
}

:deep(.el-button:focus-visible) {
  outline: none;
}

.main-content {
  margin: 24px 24px 0 !important;
}

.search-form {
  :deep(.el-form-item) {
    margin-bottom: 12px;
  }
}
</style>
