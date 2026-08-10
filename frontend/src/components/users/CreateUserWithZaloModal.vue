<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <div v-if="open" class="employee-overlay" @click.self="close">
    <section class="employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-title">
      <header>
        <div>
          <h2 id="employee-title">＋ Thêm nhân viên</h2>
          <p>Tạo tài khoản nội bộ bằng username và mật khẩu.</p>
        </div>
        <button class="close" :disabled="saving" aria-label="Đóng" @click="close">×</button>
      </header>

      <form @submit.prevent="createEmployee">
        <div class="field">
          <label for="employee-name">Họ và tên đầy đủ <span>*</span></label>
          <input id="employee-name" v-model.trim="form.fullName" autocomplete="name" placeholder="VD: Tạ Thành Đạt" />
        </div>

        <div class="row">
          <div class="field">
            <label for="employee-username">Tên đăng nhập <span>*</span></label>
            <input
              id="employee-username"
              v-model.trim="form.username"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              placeholder="VD: thanhdat"
            />
            <small>3–32 ký tự: chữ thường, số, dấu chấm, _ hoặc -</small>
          </div>
          <div class="field">
            <label for="employee-password">Mật khẩu ban đầu <span>*</span></label>
            <div class="password-wrap">
              <input
                id="employee-password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="Tối thiểu 8 ký tự"
              />
              <button type="button" class="show-password" @click="showPassword = !showPassword">
                {{ showPassword ? 'Ẩn' : 'Hiện' }}
              </button>
            </div>
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label for="employee-department">Phòng ban <span>*</span></label>
            <select id="employee-department" v-model="form.departmentId" @change="syncPermissionGroup">
              <option value="" disabled>— Chọn phòng ban —</option>
              <option v-for="d in businessDepartments" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
          </div>
          <div class="field">
            <label for="employee-permission">Nhóm quyền</label>
            <select id="employee-permission" v-model="form.permissionGroupId" disabled>
              <option value="">— Tự chọn theo phòng ban —</option>
              <option v-for="g in businessGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
            <small>Sale → Sale · Designer → Designer</small>
          </div>
        </div>

        <div v-if="error" class="alert">{{ error }}</div>

        <footer>
          <button type="button" class="secondary" :disabled="saving" @click="close">Hủy</button>
          <button type="submit" class="primary" :disabled="!canSubmit || saving">
            {{ saving ? 'Đang tạo…' : 'Tạo nhân viên' }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { api } from '@/api/index';

interface NamedNode { id: string; name: string; _depth: number }
const props = defineProps<{ open: boolean; departments: NamedNode[]; permissionGroups: NamedNode[] }>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'created'): void }>();

const form = reactive({ fullName: '', username: '', password: '', departmentId: '', permissionGroupId: '' });
const saving = ref(false);
const showPassword = ref(false);
const error = ref('');
const allowedNames = new Set(['Sale', 'Designer']);

const businessDepartments = computed(() => props.departments.filter((item) => allowedNames.has(item.name)));
const businessGroups = computed(() => props.permissionGroups.filter((item) => allowedNames.has(item.name)));
const canSubmit = computed(() =>
  form.fullName.length > 0 &&
  /^[a-z0-9._-]{3,32}$/.test(form.username.toLowerCase()) &&
  form.password.length >= 8 &&
  !!form.departmentId &&
  !!form.permissionGroupId,
);

function syncPermissionGroup() {
  const department = businessDepartments.value.find((item) => item.id === form.departmentId);
  form.permissionGroupId = businessGroups.value.find((item) => item.name === department?.name)?.id ?? '';
}

async function createEmployee() {
  if (!canSubmit.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post('/users', {
      fullName: form.fullName,
      username: form.username.toLowerCase(),
      password: form.password,
      departmentId: form.departmentId,
      permissionGroupId: form.permissionGroupId,
      role: 'member',
    });
    emit('created');
    emit('update:open', false);
  } catch (cause: any) {
    error.value = cause?.response?.data?.error || 'Không thể tạo nhân viên';
  } finally {
    saving.value = false;
  }
}

function close() {
  if (!saving.value) emit('update:open', false);
}

watch(() => props.open, (open) => {
  if (!open) return;
  Object.assign(form, { fullName: '', username: '', password: '', departmentId: '', permissionGroupId: '' });
  showPassword.value = false;
  error.value = '';
});
</script>

<style scoped>
.employee-overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:rgba(15,23,42,.55)}
.employee-modal{width:min(650px,100%);overflow:hidden;border-radius:16px;background:#fffaf2;box-shadow:0 24px 70px rgba(0,0,0,.28)}
header{display:flex;align-items:flex-start;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #e7e1d8}h2{margin:0;font-size:20px}header p{margin:5px 0 0;color:#737373;font-size:13px}.close{width:34px;height:34px;border:0;border-radius:8px;background:transparent;font-size:25px;cursor:pointer}.close:hover{background:#eee8df}
form{display:flex;flex-direction:column;gap:16px;padding:22px 24px}.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field{display:flex;min-width:0;flex-direction:column;gap:7px}.field label{color:#444;font-size:13px;font-weight:600}.field label span{color:#d14343}.field input,.field select{box-sizing:border-box;width:100%;height:42px;padding:0 12px;border:1px solid #cfd3da;border-radius:8px;background:#fff;font:inherit}.field input:focus,.field select:focus{outline:3px solid rgba(45,108,223,.15);border-color:#2d6cdf}.field select:disabled{color:#444;background:#f3f4f6}.field small{color:#858585;font-size:11.5px}.password-wrap{position:relative}.password-wrap input{padding-right:58px}.show-password{position:absolute;right:5px;top:5px;height:32px;padding:0 8px;border:0;border-radius:6px;color:#2d6cdf;background:#eef4ff;cursor:pointer;font-size:12px;font-weight:600}.alert{padding:10px 12px;border-left:3px solid #d14343;border-radius:7px;color:#a52020;background:#fff0f0;font-size:13px}footer{display:flex;justify-content:flex-end;gap:10px;padding-top:15px;border-top:1px solid #e7e1d8}footer button{min-height:40px;padding:0 16px;border-radius:8px;font:inherit;font-weight:600;cursor:pointer}.secondary{border:1px solid #cfd3da;background:#fff}.primary{border:0;color:#fff;background:#2d6cdf}.primary:disabled{cursor:not-allowed;background:#aac4ec}@media(max-width:620px){.row{grid-template-columns:1fr}.employee-overlay{padding:0}.employee-modal{height:100%;border-radius:0;overflow:auto}}
</style>
