/*
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * Copyright 2023 Xyna GmbH, Germany
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 */
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostBinding, Input, OnDestroy, ViewChild } from '@angular/core';
import { MatSort } from '@angular/material/sort';

import { Subscription } from 'rxjs';

import { A11yService, ScreenreaderPriority } from '../../a11y';
import { XoObject } from '../../api';
import { coerceBoolean } from '../../base';
import { I18nService, LocaleService } from '../../i18n';
import { XcIdentityDataWrapper } from '../shared/xc-data-wrapper';
import { XcOptionItemString } from '../shared/xc-item';
import { XcSortDirection, XcSortDirectionFromString } from '../shared/xc-sort';
import { XcAutocompleteDataWrapper, XcFormAutocompleteComponent } from '../xc-form/xc-form-autocomplete/xc-form-autocomplete.component';
import { XcFormBaseComponent } from '../xc-form/xc-form-base/xc-form-base.component';
import { XcFormAutocompleteTemplate, XcFormInputTemplate, XcFormTemplate, XcTemplate } from '../xc-template/xc-template';
import { xcTableTranslations_deDE } from './locale/xc-translations.de-DE';
import { xcTableTranslations_enUS } from './locale/xc-translations.en-US';
import { XcTableColumn, XcTableDataSource } from './xc-table-data-source';


@Component({
    selector: 'xc-table',
    templateUrl: './xc-table.component.html',
    styleUrls: ['./xc-table.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class XcTableComponent implements AfterViewInit, OnDestroy {

    private _allowSort = false;
    private _allowFilter = false;
    private _allowSelect = false;
    private _allowActivate = false;
    private _multiSelect = false;
    private _cellSelect = false;
    private _lazyUpdate = false;
    private _visibleActions = false;
    private _dataSource: XcTableDataSource<any>;
    private _dataSourceSubscriptions = new Array<Subscription>();
    private _matSort: MatSort;

    private readonly filterTemplates = new Map<string, {template: XcFormTemplate<any, any>; component?: XcFormBaseComponent}>();
    private readonly filterTemplateSubscriptions: Subscription[] = [];

    private tbody: HTMLTableSectionElement;
    private thead: HTMLTableSectionElement;

    private focusViaTabDetectionSubscription: Subscription;


    constructor(
        private readonly cdRef: ChangeDetectorRef,
        private readonly elementRef: ElementRef,
        private readonly _a11y: A11yService,
        private readonly _i18n: I18nService
    ) {
        _i18n.setTranslations(LocaleService.EN_US, xcTableTranslations_enUS);
        _i18n.setTranslations(LocaleService.DE_DE, xcTableTranslations_deDE);
    }


    ngAfterViewInit() {
        void Promise.resolve().then(() => {
            if (!this.lazyUpdate) {
                this.dataSource.refresh();
            }
        });

        // make table body focusable and set key listener
        const xcTable: HTMLElement = this.elementRef.nativeElement;
        const table = xcTable.querySelector('table');
        table.setAttribute('role', 'table');
        this.thead = xcTable.querySelector('thead');
        this.tbody = xcTable.querySelector('tbody');
        this.tbody.setAttribute('tabindex', '0');
        this.tbody.onkeydown = this.keyDown.bind(this);
        const tbodyMessage = this.i18n.translate('Use the arrow keys Up and Down to switch between rows');
        this.tbody.setAttribute('aria-label', tbodyMessage);


        this.focusViaTabDetectionSubscription = this._a11y.emitElementFocusStateChange(this.tbody).subscribe(state => {
            if (state.type === 'focus' && state.achieved === 'keyboard') {
                let row = this.getFocusedRow();
                let rowEl = this.getFocusedRowElement();
                const rowFound = row && rowEl;

                if (!rowFound && this.tbody) {
                    // focus the first row
                    row = this.dataSource.rows[0];
                    rowEl = this.tbody.querySelector('tr');

                    if (row && rowEl) {
                        this.focusRow(row);
                        this.focusRowElement(rowEl);
                        this.cdRef.detectChanges();
                    }
                }
            }
        });
    }


    ngOnDestroy(): void {
        this.unsubscribeDataSource();

        if (this.focusViaTabDetectionSubscription) {
            this.focusViaTabDetectionSubscription.unsubscribe();
        }
    }


    private unsubscribeDataSource() {
        this._dataSourceSubscriptions.forEach(subscription => subscription.unsubscribe());
        this._dataSourceSubscriptions = [];
    }


    private updateDataSourceSort() {
        if (this.matSort && this.dataSource) {
            this.dataSource.setSortPathAndDirection(
                this.getPathFromId(this.matSort.active),
                XcSortDirectionFromString(this.matSort.direction)
            );
        }
    }


    private updateMatSort() {
        if (this.matSort && this.dataSource) {
            const column = this.dataSource.columns.find(c => c.path === this.dataSource.getSortPath());
            if (column) {
                this.matSort.active = this.getColumnID(column);
            }
            switch (this.dataSource.getSortDirection()) {
                case XcSortDirection.asc: this.matSort.direction = 'asc';  break;
                case XcSortDirection.dsc: this.matSort.direction = 'desc'; break;
                default:
                    this.matSort.direction = '';
                    this.matSort.active    = '';
            }
        }
    }


    get i18n(): I18nService {
        // use i18n service from data source, if available
        if (this.dataSource && this.dataSource.i18n) {
            return this.dataSource.i18n;
        }
        // use zeta's i18n service
        return this._i18n;
    }


    @ViewChild(MatSort, {static: false})
    set matSort(value: MatSort) {
        this._matSort = value;
        this.matSort.sortChange.subscribe(() => this.updateDataSourceSort());
        this.updateMatSort();
    }


    get matSort(): MatSort {
        return this._matSort;
    }


    @Input('xc-table-datasource')
    set dataSource(value: XcTableDataSource<any>) {
        this.unsubscribeDataSource();
        this.filterTemplates.clear();
        this._dataSource = value;
        if (this.dataSource) {
            // subscribe to sort changes
            this.updateMatSort();
            this._dataSourceSubscriptions.push(
                this.dataSource.sortChange.subscribe(() => this.updateMatSort())
            );
            // subscribe to mark for changes
            this._dataSourceSubscriptions.push(
                this.dataSource.markForChange.subscribe(() => this.cdRef.markForCheck())
            );

            this._dataSourceSubscriptions.push(
                this.dataSource.markForReset.subscribe(() => {
                    this.filterTemplates.forEach((filterTemplate) => {
                        if (filterTemplate.template && 'reset' in filterTemplate.template) {
                            (filterTemplate.template as any).reset = true;
                        }
                    });
                    this.cdRef.markForCheck();
                })
            );

            // subscribe to data changes
            this._dataSourceSubscriptions.push(
                this.dataSource.dataChange.subscribe(() => {
                    this.filterTemplates.clear();
                    this.filterTemplateSubscriptions.forEach(subscription => subscription.unsubscribe());
                    this.filterTemplateSubscriptions.splice(0);
                })
            );
        }
    }


    get dataSource(): XcTableDataSource<any> {
        return this._dataSource;
    }


    @Input('xc-table-allowsort')
    set allowSort(value: boolean) {
        this._allowSort = coerceBoolean(value);
    }


    get allowSort(): boolean {
        return this._allowSort;
    }


    @Input('xc-table-allowfilter')
    set allowFilter(value: boolean) {
        this._allowFilter = coerceBoolean(value);
    }


    get allowFilter(): boolean {
        return this._allowFilter;
    }


    @Input('xc-table-allowactivate')
    set allowActivate(value: boolean) {
        this._allowActivate = coerceBoolean(value);
    }


    get allowActivate(): boolean {
        return this._allowActivate;
    }


    @HostBinding('class.allowselect')
    @Input('xc-table-allowselect')
    set allowSelect(value: boolean) {
        this._allowSelect = coerceBoolean(value);
    }


    get allowSelect(): boolean {
        return this._allowSelect;
    }


    @Input('xc-table-multiselect')
    set multiSelect(value: boolean) {
        this._multiSelect = coerceBoolean(value);
    }


    get multiSelect(): boolean {
        return this._multiSelect;
    }


    @HostBinding('class.cellselect')
    @Input('xc-table-cellselect')
    set cellSelect(value: boolean) {
        this._cellSelect = coerceBoolean(value);
    }


    get cellSelect(): boolean {
        return this._cellSelect;
    }


    @Input('xc-table-lazyupdate')
    set lazyUpdate(value: boolean) {
        this._lazyUpdate = coerceBoolean(value);
    }


    get lazyUpdate(): boolean {
        return this._lazyUpdate;
    }


    @Input('xc-table-visibleactions')
    set visibleActions(value: boolean) {
        this._visibleActions = coerceBoolean(value);
    }


    get visibleActions(): boolean {
        return this._visibleActions;
    }


    @HostBinding('class.refreshing')
    get refreshing(): boolean {
        return this.dataSource && this.dataSource.refreshing;
    }


    get columns(): XcTableColumn[] {
        return this.dataSource
            ? this.dataSource.columns
            : [];
    }


    get columnPaths(): string[] {
        return this.columns.map(column => column.path);
    }


    get columnIds(): string[] {
        return this.columns.map(column => this.getColumnID(column));
    }


    get columnNames(): string[] {
        return this.columns.map(column => column.name);
    }


    getPathFromId(id: string) {
        return id.substring(0, id.indexOf('\0'));
    }


    getColumnID(column: XcTableColumn): string {
        return [column.path, column.name, column.disableSort ?? false, column.disableFilter ?? false, column.filterTooltip ?? '',column.filterMultiselect ?? false].join('\0');
    }


    getColumnFilterAriaLabel(name: string): string {
        return this.i18n.translate('Input field for filtering of $0', {key: '$0', value: this.i18n.translate(name || 'this column')});
    }


    getColumnFilterValue(path: string): string {
        return this.dataSource
            ? this.dataSource.getFilter(path)
            : '';
    }


    getColumnFilterTemplate(column: XcTableColumn): XcTemplate | any {
        if (this.dataSource) {
            const path = column.path;
            let filter = this.filterTemplates.get(path);
            // create new template
            let isMultiSelect = false;
            if (!filter) {
                filter = {template: undefined};
                 isMultiSelect = column.filterMultiselect === true;
                const filterEnum = this.dataSource.filterEnums.get(path);
                if (filterEnum) {
                    // autocomplete template
                    filter.template = new XcFormAutocompleteTemplate(new XcAutocompleteDataWrapper(
                        ()           => this.dataSource.getFilter(path),
                        (value: any) => this.dataSource.setFilter(path, value),
                        filterEnum
                    ));
                    if (filter.template instanceof XcFormAutocompleteTemplate) {
                          if (this.dataSource.filterEnumsAsInput.has(path)) {
                            filter.template.asInput = true;
                            filter.template.suffix = 'clear';
                        } else {
                            filter.template.asDropdown = true;
                            if (isMultiSelect) {
                                filter.template.asMultiselect = true;
                            } 
                        }
                    }
                } else {
                    // forminput template
                    filter.template = new XcFormInputTemplate(
                        new XcIdentityDataWrapper(
                            ()           => this.dataSource.getFilter(path),
                            (value: any) => this.dataSource.setFilter(path, value)
                        )
                    );
                }
                filter.template.disabled = column.disableFilter;
                filter.template.compact  = true;
                filter.template.tooltip  = column.filterTooltip;
                filter.template.callback = component => {
                    filter.component = component;
                    // set value and option of component because the datawrapper resets unknown options when autocomplete is used as input
                    if (component instanceof XcFormAutocompleteComponent && this.dataSource.filterEnumsAsInput.has(path)) {
                        component.value = this.dataSource.getFilter(path);
                        component.option = XcOptionItemString(component.value);
                    }
                    this.filterTemplateSubscriptions.push(
                        filter.component.valueKeydown.subscribe((event: KeyboardEvent) => {
                            if (event.key === 'Enter') {
                                this.dataSource.applyFilters();
                            }
                        })
                    );
                };
                this.filterTemplates.set(path, filter);
            }
            // return template
            return filter.template;
        }
    }


    getCellData(row: any, path: string): XcTemplate[] | any {
        return this.dataSource
            ? this.dataSource.resolve(row, path)
            : undefined;
    }


    getCellStyles(row: any, path: string): string[] {
        return this.dataSource && this.dataSource.stylesFunction
            ? this.dataSource.stylesFunction(row, path)
            : undefined;
    }


    mouseDown(event: MouseEvent) {
        if (event.shiftKey) {
            // shift is used to mark multiple rows as selected, so the event
            // must be prevented to disable text-seleciton inside the table
            event.preventDefault();
        }
    }


    keyDown(event: KeyboardEvent) {
        const row = this.getFocusedRow();
        const rowEl = this.getFocusedRowElement();
        if (event.key === 'ArrowUp' || event.key === 'Up') {
            this.focusRow(this.getPrevRow(row));
            this.focusRowElement(this.getPrevRowElement(rowEl));
            event.preventDefault();
        }
        if (event.key === 'ArrowDown' || event.key === 'Down') {
            this.focusRow(this.getNextRow(row));
            this.focusRowElement(this.getNextRowElement(rowEl));
            event.preventDefault();
        }
        if (event.key === 'Enter' || event.key === ' ') {
            this.selectRow(row, event.ctrlKey, event.shiftKey);
        }
        if (event.ctrlKey && (event.key === 'ArrowRight' || event.key === 'Right')) {
            this.dataSource.selectionModel.activate(row);
            event.preventDefault();
            // so that the xc-table-component updates css classes and stylings
            this.cdRef.detectChanges();
        }
        if (event.ctrlKey && (event.key === 'ArrowLeft' || event.key === 'Left')) {
            if (this.isRowActivated(row)) {
                this.dataSource.selectionModel.activate(null);
            }
            event.preventDefault();
            // so that the xc-table-component updates css classes and stylings
            this.cdRef.detectChanges();
        }
    }


    getRowIndex(row: any): number {
        return this.dataSource
            ? this.dataSource.rows.indexOf(row)
            : -1;
    }


    getPrevRow(row: any): any {
        if (this.dataSource) {
            let idx = this.getRowIndex(row) - 1;
            if (idx < 0) {
                idx += this.dataSource.rows.length;
            }
            return this.dataSource.rows[idx];
        }
    }


    getPrevRowElement(row: HTMLTableRowElement): HTMLTableRowElement {
        return row ? (row.previousElementSibling || row.parentElement.children[row.parentElement.children.length - 1]) as HTMLTableRowElement : null;
    }


    getNextRow(row: any): any {
        if (this.dataSource) {
            let idx = this.getRowIndex(row) + 1;
            if (idx > this.dataSource.rows.length - 1) {
                idx -= this.dataSource.rows.length;
            }
            return this.dataSource.rows[idx];
        }
    }


    getNextRowElement(row: HTMLTableRowElement): HTMLTableRowElement {
        return row ? (row.nextElementSibling || row.parentElement.children[0]) as HTMLTableRowElement : null;
    }


    getSelectedRows(): any[] {
        if (this.dataSource) {
            return this.dataSource.selectionModel.selection;
        }
    }


    getFocusedRow(): any {
        if (this.dataSource) {
            return this.dataSource.selectionModel.focused;
        }
    }


    getFocusedRowElement(): HTMLTableRowElement {
        let focusedRows: HTMLTableRowElement;
        if (this.tbody) {
            focusedRows = this.tbody.querySelector('tr.focused');
        }
        return focusedRows;
    }


    doubleClickRow(row: any) {
        if (this.allowActivate) {
            this.dataSource.selectionModel.activate(row);
        }
    }


    focusRow(row: any) {
        this.dataSource.selectionModel.focus(row);
        // screenreader only (read row)
        if (row instanceof XoObject) {
            // TODO - if a column.path resolves to XcTemplate it returns the template instead of a primitive
            // Possible Solution: If it resolves to XcTemplate, then it could call toString()
            // it's up to the developer that toString() returns a string with the essential information
            const colTexts = this.columns.map<string>(column => this.i18n.translate(column.name) + ' : ' + row.resolve(column.path));
            this._a11y.screenreaderSpeak(colTexts.join(', '), ScreenreaderPriority.Assertive);
        }
    }


    focusRowElement(element: HTMLTableRowElement) {
        const parent = this.elementRef.nativeElement;
        const topOffset = this.thead.getBoundingClientRect().height;
        const e = element.getBoundingClientRect();
        const p = parent.getBoundingClientRect();
        if (e.top < p.top + topOffset) {
            parent.scrollTop -= p.top - e.top + topOffset + 1;
        }
        if (e.bottom > p.bottom) {
            parent.scrollTop += e.bottom - p.bottom + 1;
        }
    }


    selectRow(row: any, ctrl = false, shift = false) {
        if (row && this.dataSource && this.allowSelect && !this.cellSelect) {
            // regard multi selection only if it is enabled and either control key or shift key is pressed
            if (this.multiSelect && ctrl) {
                this.dataSource.selectionModel.toggle(row);
            } else if (this.multiSelect && shift) {
                this.dataSource.selectionModel.rangeSelect(this.dataSource.rows, row);
            } else {
                this.dataSource.selectionModel.combineOperations(() => {
                    // if it is not already selected, select the row
                    this.dataSource.selectionModel.clear();
                    this.dataSource.selectionModel.select(row);
                });
            }
        }
    }


    selectCell(row: any, path: string, ctrl: boolean, shift: boolean) {
        if (row && this.dataSource && this.allowSelect && this.cellSelect) {
            // regard multi selection only if it is enabled and either control key or shift key is pressed
            if (this.multiSelect && ctrl) {
                this.dataSource.selectionModel.subToggle(row, path);
            } else if (this.multiSelect && shift) {
                this.dataSource.selectionModel.subRangeSelect(this.dataSource.rows, row, this.columnPaths, path);
            } else {
                this.dataSource.selectionModel.combineOperations(() => {
                    // if it is not already selected, select the row
                    this.dataSource.selectionModel.clear();
                    this.dataSource.selectionModel.subSelect(row, path);
                });
            }
        }
    }


    isRowFocused(row: any): boolean {
        return !this.cellSelect && this.dataSource && this.dataSource.selectionModel.isFocused(row);
    }


    isRowSelected(row: any): boolean {
        return !this.cellSelect && this.dataSource && this.dataSource.selectionModel.isSelected(row);
    }


    isRowActivated(row: any): boolean {
        return !this.cellSelect && this.dataSource && this.dataSource.selectionModel.isActivated(row);
    }


    isCellSelected(row: any, path: string): boolean {
        return this.cellSelect && this.dataSource && this.dataSource.selectionModel.isSubSelected(row, path);
    }


    loadMoreData() {
        if (this.dataSource && this.dataSource.moreDataAvailable && !this.dataSource.refreshing) {
            this.dataSource.moreData.next();
        }
    }


    @HostBinding('class.no-columns')
    get noColumns(): boolean {
        return !this.dataSource || !this.dataSource.columns.length;
    }


    @HostBinding('class.no-rows')
    get noRows(): boolean {
        return !this.dataSource || !this.dataSource.rows.length;
    }


    get noData(): boolean {
        return this.noColumns || this.noRows;
    }


    get noDataLabel(): string {
        let label = this.dataSource ? this.dataSource.requestErrorMessage : undefined;

        if (!label) {
            let dataError = 'data';
            if (this.noColumns && !this.noRows) {
                dataError = 'columns';
            }
            if (this.noRows && !this.noColumns) {
                dataError = 'rows';
            }
            label = this.i18n.translate(`no ${dataError} ${this.dataSource && this.dataSource.limit === 0 ? 'requested' : 'available'}!`);
        }

        return label;
    }
}
