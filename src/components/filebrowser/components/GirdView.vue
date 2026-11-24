<template>
	<div id="select-container"
		class="scroll-container scrollbars-light is-relative w-full"
		@contextmenu.prevent="openContextMenu"
		@mousedown.left.prevent="onDragSelectionStart">
		<!-- Empty Content Slot Start -->
		<div v-if="listData.length == 0 && !isLoading"
			class="is-flex is-align-items-center is-justify-content-center empty-container">
			<slot></slot>
		</div>
		<!-- Empty Content Slot End -->
		<div class="content-components select-parent">
			<div class="card-container">
				<div v-for="(item, index) in listData"
					:key="`list-${index}${item.name}`"
					:data-rel="index"
					class="grid-card rdata selectable">
					<div class="file-card">
						<div :data-rel="index" class="file-card-item" @mousedown.stop="">
							<div class="node-card-container">
								<div :class="{ active: item.isSelected }" class="outer-wrapper">
									<div :class="{ 'isCutting': getCardState(item), 'file-move-target': filePanel?.moveTarget === item.path }"
										:draggable="filePanel?.canDragFile(item)" class="node-card is-unselectable"
										@click.stop="onCardClick($event, item, index)"
										@contextmenu.prevent="openContextMenu($event, item)"
										@dragend="filePanel?.clearFileDrag()"
										@dragleave="filePanel?.leaveMoveTarget($event, item.path)"
										@dragover="filePanel?.showMoveTarget($event, item)"
										@dragstart="filePanel?.startFileDrag($event, item)"
										@drop="filePanel?.dropFiles($event, item)">
										<div class="cover">
											<icon-container :item="item"></icon-container>
										</div>
										<div class="info">
											<p class="title">{{ item.name }}</p>
											<p class="desc">{{ dateFmt(item.date) }}</p>
										</div>
									</div>

									<!-- CheckBox Start -->
									<b-field :class="{ show: isMobile || item.isSelected }"
										class="checkbox-container is-flex">
										<b-checkbox v-model="item.isSelected"
											size="is-small"
											@update:model-value="handleCheckboxInput($event, index)"></b-checkbox>
									</b-field>
									<!-- CheckBox End -->

									<action-button :class="{ show: isMobile }" @click.stop="openContextMenu($event, item)" />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
			<!-- SelectDivLayer Start -->
			<div v-show="isShowSeBox" id="selection"></div>
			<!-- SelectDivLayer End -->
		</div>

		<!-- Context Menu Start -->
		<!-- eslint-disable-next-line vue/no-unused-refs -- opened by mixins/mixin.js -->
		<context-menu ref="ctxMenu" @reload="$emit('reload')"></context-menu>
		<!-- Context Menu End -->
	</div>
</template>

<script>
import ActionButton from './ActionButton.vue'
import ContextMenu from './ContextMenu.vue'
import IconContainer from './IconContainer.vue'
import ListViewMixin from '@/mixins/ListViewMixin'
import { mixin } from '@/mixins/mixin'

export default {
	name: 'gird-view',
	mixins: [mixin, ListViewMixin],
	components: {
		ActionButton,
		ContextMenu,
		IconContainer,
	},
	created() {
		this.SELECT_BOX = 'selection'
		this.PARENT_BOX = 'select-container'
		this.SELECT_ITEM = '.file-card-item'
		this.M_WIDTH = 768
	},
}
</script>
