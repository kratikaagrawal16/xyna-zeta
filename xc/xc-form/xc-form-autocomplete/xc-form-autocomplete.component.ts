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
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, forwardRef, HostBinding, Input, NgZone, OnDestroy, Output, ViewChild } from '@angular/core';
import { MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatOption } from '@angular/material/core';
import { MatSelect } from '@angular/material/select';

import { merge, Observable, OperatorFunction, Subject, Subscription } from 'rxjs';
import { debounceTime, map, tap } from 'rxjs/operators';
import { FormControl } from '@angular/forms';

import { A11yService } from '../../../a11y';
import { Xo, XoObject, XoPropertyBinding } from '../../../api';
import { coerceBoolean, Comparable, isObject, isString, isTextOverflowing, Native, NativeArray } from '../../../base';
import { I18nService } from '../../../i18n';
import { XcBoxableDataWrapper } from '../../shared/xc-data-wrapper';
import { XcOptionItem, XcOptionItemString, XcOptionItemValueType } from '../../shared/xc-item';
import { XcSortDirection, XcSortDirectionFromString, XcSortPredicate } from '../../shared/xc-sort';
import { XcFormBaseComponent } from '../xc-form-base/xc-form-base.component';
import { XcFormBaseInputComponent } from '../xc-form-base/xc-form-baseinput.component';


interface FromXoEnumeratedPropertyCallbacks {
    setter?: (value: Native) => Native | void;
    options?: (value: XcOptionItem[]) => void;
}


export class XcAutocompleteDataWrapper<V = XcOptionItemValueType> extends XcBoxableDataWrapper<XcOptionItem<V>, V> {

    private readonly _valuesChange = new Subject<XcOptionItem<V>[]>();
    private _values: XcOptionItem<V>[];
    private _value: XcOptionItem<V>;


    static getXoEnumeratedValuesMapper<W = XcOptionItemValueType>(): OperatorFunction<NativeArray, XcOptionItem<W>[]> {
        return map((data: any[]) => data.map(value => <XcOptionItem>{ name: `${value}`, value: value }));
    }

    static getXoEnumeratedOptionItems<W = XcOptionItemValueType>(instance: Xo, propertyPath: string): Observable<XcOptionItem<W>[]> {
        const resolved = instance.resolveHead(propertyPath);
        const propertyHost = resolved.value;
        const propertyName = resolved.tail;
        if (propertyHost instanceof XoObject && propertyName) {
            const observable = propertyHost.enumeratedProperties.get(propertyName);
            if (observable) {
                return observable.pipe(
                    XcAutocompleteDataWrapper.getXoEnumeratedValuesMapper(),
                    tap((items: XcOptionItem[]) => items.unshift(XcOptionItemString()))
                );
            }
        }
    }

    static fromXoEnumeratedPropertyPath(instance: Xo, propertyPath: string, boxed = false, callbacks: FromXoEnumeratedPropertyCallbacks = {}): XcAutocompleteDataWrapper {
        const resolved = instance.resolveHead(propertyPath);
        const propertyHost = resolved.value;
        const propertyName = resolved.tail;
        if (propertyHost instanceof XoObject && propertyName) {
            const observable = propertyHost.enumeratedProperties.get(propertyName);
            if (observable) {
                return new XcAutocompleteDataWrapper(
                    // getter
                    () => propertyHost[propertyName],
                    // setter
                    callbacks.setter
                        ? value => propertyHost[propertyName] = callbacks.setter(value) || value
                        : value => propertyHost[propertyName] = value,
                    // xc option item mapped observable
                    observable.pipe(
                        XcAutocompleteDataWrapper.getXoEnumeratedValuesMapper(),
                        tap(callbacks.options)
                    ),
                    boxed
                );
            }
        }
    }

    static fromXoEnumeratedPropertyBinding<T extends XoObject, U extends Native>(binding: XoPropertyBinding<T, U>, boxed = false, callbacks: FromXoEnumeratedPropertyCallbacks = {}): XcAutocompleteDataWrapper {
        if (binding.instance && binding.accessor) {
            const propertyPaths = <any>binding.instance.decoratorClass.getAccessorMap();
            const propertyPath = <any>binding.accessor(propertyPaths);
            if (!isObject(propertyPath)) {
                const dataWrapper = XcAutocompleteDataWrapper.fromXoEnumeratedPropertyPath(binding.instance, propertyPath, boxed, callbacks);
                if (dataWrapper) {
                    return dataWrapper;
                }
                console.warn('fromXoEnumeratedPropertyBinding: accessor of binding does not yield an enumerated property');
            } else {
                console.warn('fromXoEnumeratedPropertyBinding: accessor of binding yields an xo instead of an enumerated property');
            }
        }
    }

    constructor(getter: () => V, setter: (value: V) => void, values?: XcOptionItem<V>[] | Observable<XcOptionItem<V>[]>, boxed = false) {
        super(getter, setter, boxed);
        if (values instanceof Array) {
            this.values = values;
        } else if (values) {
            values.subscribe(data => this.values = data);
        }
    }

    get valuesChange(): Observable<XcOptionItem<V>[]> {
        return this._valuesChange.asObservable();
    }

    set values(value: XcOptionItem<V>[]) {
        if (this._values !== value) {
            this._values = value;
            this.update();
        }
    }

    get values(): XcOptionItem<V>[] {
        return this._values;
    }

    set value(value: XcOptionItem<V>) {
        if (this._value !== value) {
            this._value = value;
            this.setter(this.value ? this.value.value : this.nullRepresentation);
        }
    }

    get value(): XcOptionItem<V> {
        return this._value;
    }

    preset(transform: (value: V) => XcOptionItem<V>) {
        this._value = transform(this.getter());
    }

    update() {
        if (this.values) {
            const getterValue = this.getter();
            const value = this.values.find(option =>
                option.value instanceof Comparable && getterValue instanceof Comparable
                    ? option.value.equals(getterValue)
                    : option.value === getterValue
            );
            if (value || !getterValue) {
                this._value = value;
            }
        }
        this._valuesChange.next(this.values);
    }
}

// this is an interface only used internally in the XcFormAutocompleteComponent class
interface XcOptionInternalAutocompleteItem extends XcOptionItem {
    showTooltip?: boolean;
}


@Component({
    selector: 'xc-form-autocomplete',
    templateUrl: './xc-form-autocomplete.component.html',
    styleUrls: ['../xc-form-base/xc-form-base.component.scss', './xc-form-autocomplete.component.scss'],
    providers: [{ provide: XcFormBaseComponent, useExisting: forwardRef(() => XcFormAutocompleteComponent) }],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class XcFormAutocompleteComponent extends XcFormBaseInputComponent implements AfterViewInit, OnDestroy {

    /**
     * Screen Reader will read this string (translated) if this component is an autocomplete (default or asinput)
     * and there is no @Input for 'xc-form-autocomplete-a11yfocusline'
     */
    static globalAutocompleteA11yFocusLine = 'Autocomplete: You can type in text and select from options with the arrow keys';
    /**
     * Screen Reader will read this string (translated) if this component is asdropdown
     * and there is no @Input for 'xc-form-autocomplete-a11yfocusline'
     */
    static globalDropdownA11yFocusLine = 'Dropdown: You can switch between options with the arrow keys';

    private readonly updateFilteredOptions = new Subject<XcOptionItem>();

    /** determines whether the selected option can be reset to the first enabled option */
    private selectedIdxResettable = false;

    /** index of selected option within filtered and sorted options */
    private selectedIdx = -1;

    /** index of first enabled option within filtered and sorted options */
    private enabledIdx = -1;

    private openPanelWasJustClosed = false;
    private suppressNextFocusEmit = false;

    protected _subscription: Subscription;
    protected _asInput = false;
    protected _asDropdown = false;
    protected _caseSensitive = false;
    protected _fullTextSearch = false;
    protected _sortDirection = XcSortDirection.none;
    protected _options = new Array<XcOptionInternalAutocompleteItem>();

    filteredOptions: Observable<XcOptionInternalAutocompleteItem[]>;
    selectedOption: XcOptionInternalAutocompleteItem;


    @ViewChild(MatAutocompleteTrigger, { static: false })
    trigger: MatAutocompleteTrigger;

    @Input('xc-form-autocomplete-a11yfocusline')
    readonly a11yFocusLine: string;

    @Output('xc-form-autocomplete-optionChange')
    readonly optionChange = new EventEmitter<XcOptionItem>();

    @Output('xc-form-autocomplete-optionsOpened')
    readonly optionsOpened = new EventEmitter();

    @Output('xc-form-autocomplete-optionsClosed')
    readonly optionsClosed = new EventEmitter();


    constructor(
        private readonly cdRef: ChangeDetectorRef,
        private readonly a11yService: A11yService,
        private readonly i18nService: I18nService,
        private readonly elementRef: ElementRef,
        private readonly ngZone: NgZone
    ) {
        super(elementRef, i18nService);
        this.filteredOptions = merge(this.formControl.valueChanges.pipe(debounceTime(10)), this.updateFilteredOptions).pipe(
            // maps form option to string, if needed
            map((value: string | XcOptionItem) => isObject(value) ? this.optionName(<XcOptionItem>value) : <string>value),
            tap(() => this.asInput ? this.setActiveItem(-1) : null),
            // maps string to options array by filtering or copying
            map(value => value ? this.filter(value) : this.copy()),
            // sort options array by view
            map(array => this.sort(array)),
            // compute selected index
            tap(array => this.selectedIdx = array.findIndex(option => option === this.selectedOption)),
            // compute enabled index
            tap(array => this.enabledIdx = array.findIndex(option => !option.disabled))
        );
    }


    ngAfterViewInit() {
        const element = (this.elementRef.nativeElement as HTMLElement);
        this.ngZone.runOutsideAngular(() => {
            element.addEventListener('keydown', this.onkeydown);
            element.addEventListener('keyup', this.keyup);
        });

        // set subscription
        this._subscription = this.trigger.panelClosingActions.subscribe(() => {
            this.checkValue();
            this.cdRef.detectChanges();
        });
        // prevent resetting of the active item by internal code
        (this.trigger as any)._resetActiveItem = () => {
            if (this.selectedIdxResettable && !this.asInput) {
                this.setActiveItem(this.enabledIdx);
            }
            this.selectedIdxResettable = true;
        };
        // provoke update of filtered options
        this.updateFilteredOptions.next(this.selectedOption);
        // important to avoid change detection error
        this.cdRef.detectChanges();
    }


    ngOnDestroy() {
        // remove subscription
        if (this._subscription) {
            this._subscription.unsubscribe();
        }

        const element = (this.elementRef.nativeElement as HTMLElement);
        this.ngZone.runOutsideAngular(() => {
            element.removeEventListener('keydown', this.onkeydown);
            element.removeEventListener('keyup', this.keyup);
        });
    }


    private readonly onScrollIfAutocompleteIsOpen = (event: Event) => {
        // Chrome on Windows triggers a scroll event if the browser needs to render a too big of a text into an input element
        // in this event, the event's target is the input element itself
        const targetIsInputElement = (event.target as HTMLElement).getAttribute ? ((event.target as HTMLElement).getAttribute('id') === this.input.id) : false;
        const targetIsOptionBox = this.trigger.autocomplete.panel ? event.target === this.trigger.autocomplete.panel.nativeElement : false;
        if (this.trigger.panelOpen && !targetIsInputElement && !targetIsOptionBox) {
            this.trigger.closePanel();
        }
    };


    protected suffixClickChangedValue(unfocusedInput: boolean) {
        this.suppressNextFocusEmit = unfocusedInput;
        super.suffixClickChangedValue(unfocusedInput);
        this.checkValue();
        this.updateFilteredOptions.next(this.selectedOption);
        this.trigger.openPanel();
    }


    protected checkValue() {
        let option: any;

        // value is a string?
        if (isString(this.value)) {
            // append new option as a fallback, if autocomplete is used as input
            const options = this.asInput
                ? (this.options ?? []).concat(XcOptionItemString(this.value))
                : (this.options ?? []);
            // find option with matching name with consideration of case sensitivity
            option = options.find(o => !o.disabled && (
                (this.caseSensitive && o.name === this.value) ||
                (!this.caseSensitive && o.name.toLowerCase() === this.value.toLowerCase())
            ));
        } else {
            // use value, if it's an option
            option = isObject(this.value) ? this.value : undefined;
        }

        // restore selected option, if it's already selected
        if (this.value && option === this.selectedOption) {
            this.value = this.selectedOption;
        } else {
            // otherwise select new option
            this.select(option);
        }
    }


    protected sort(options: XcOptionItem[]) {
        return (this._sortDirection !== XcSortDirection.none)
            ? options.sort(XcSortPredicate(this._sortDirection, this.caseSensitive ? option => option.name : option => option.name.toLowerCase()))
            : options;
    }


    protected copy(): XcOptionItem[] {
        return this.options
            ? this.options.slice()
            : [];
    }


    protected filter(string: string): XcOptionItem[] {
        const result = this.options || [];
        if (!this.asDropdown) {
            return result.filter(option => {
                const optionName = this.caseSensitive ? this.optionName(option) : this.optionName(option).toLowerCase();
                const other = this.caseSensitive ? string : string.toLowerCase();
                return this.fullTextSearch
                    ? optionName.indexOf(other) >= 0
                    : optionName.startsWith(other);
            });
        }
        return result;
    }


    protected setActiveItem(idx: number) {
        this.trigger.autocomplete._keyManager.setActiveItem(idx);
    }


    protected select(value?: XcOptionItem) {
        if (this.selectedOption !== value) {
            this.option = value;
            this.optionChange.emit(value);
            this.cdRef.detectChanges();
        }
    }


    mousedown(event: MouseEvent) {
        if (!this.readonly && !this.disabled) {
            if (this.asDropdown) {
                event.preventDefault();
                if (this.trigger.panelOpen) {
                    this.trigger.closePanel();
                } else {
                    this.trigger.openPanel();
                }
            } else {
                this.trigger.openPanel();
            }
            this.cdRef.detectChanges();
        }
    }

    suffixMouseDown(event: MouseEvent) {
        super.suffixMouseDown(event);
        this.mousedown(event);
    }


    onkeydown = (event: KeyboardEvent) => {

        // trigger's panel is closed beforehand if user presses Enter
        // - therefore this.trigger.panelOpen is an insufficent indicator for checking if the panel was open
        const panelWasOpen = this.openPanelWasJustClosed || this.trigger.panelOpen;

        // prevent firefox from typing text into input field
        // is ctrl or alt true then this keydown event may be a short cut and default must not prevented
        if (!event.ctrlKey && !event.altKey && this.asDropdown && event.key !== 'Tab') {
            event.preventDefault();
        }

        if (event.key === 'Escape' || event.key === 'Enter') {
            this.trigger.closePanel();
            this.checkValue();
            if (panelWasOpen) {
                event.stopPropagation();
            }
            this.cdRef.detectChanges();
        }

        // should run in Angular's zone to avoid compatible problems
        this.ngZone.run(() => {
            super.onkeydown(event);
        });
    };


    keyup = (event: KeyboardEvent) => {

        // trigger's panel is closed beforehand if user presses Enter
        // - therefore this.trigger.panelOpen is a bad indicator for checking if the panel was open
        const panelWasOpen = this.openPanelWasJustClosed;
        this.openPanelWasJustClosed = false;

        if (panelWasOpen && event.key === 'Escape' || event.key === 'Enter') {
            event.stopPropagation();
        }

        // fixes bug which sometimes caused the panel to be closed after clearing the input all at once
        // (via CTRL+BACKSPACE / CTRL+DELETE or, with the input's text being selected, via CTRL+X / BACKSPACE / DELETE)
        // not opening if tabbed to, while pressing "Tab" or "Tab + Shift"
        const notAllowed = ['Enter', 'Escape', 'Tab', 'Shift'];
        if (!this.trigger.panelOpen && !this.input.value && !notAllowed.includes(event.key)) {
            this.value = undefined;
            this.trigger.openPanel();
        }
        this.cdRef.detectChanges();
    };


    onfocus(event: FocusEvent) {
        this.cdRef.detectChanges();

        // suppress focus emit, if necessary
        if (!this.suppressNextFocusEmit) {
            this.focus.emit(event);
        }
        this.suppressNextFocusEmit = false;

        // the autocomplete is being disabled and therefore the trigger won't auto-opening the panel as it would usually do
        this.trigger.autocompleteDisabled = true;
        setTimeout(() => this.trigger.autocompleteDisabled = false, 0);

        // TODO FIXME - it must be possible to prevent the MatAutocompleteTrigger's auto opening of the panel on focus
        // if so, we could get rid of the following a11y service method
        const txt = this.a11yFocusLine || (this.label + ' '
            + this.i18nService.translate(this.asDropdown
                ? XcFormAutocompleteComponent.globalDropdownA11yFocusLine
                : XcFormAutocompleteComponent.globalAutocompleteA11yFocusLine));
        this.a11yService.screenreaderSpeak(txt);
    }


    onblur(event: FocusEvent) {
        // suppress next focus emit, after clicking an option (which refocuses the input)
        if (event.relatedTarget instanceof HTMLElement) {
            this.suppressNextFocusEmit = event.relatedTarget.classList.contains('mat-option');
        }
        // click on disabled options should not unfocus input field!
        if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.classList.contains('mat-option-disabled')) {
            this.setFocus();
        } else {
            // fixes weird bug where autocomplete would not close when focusing an input or button afterwards
            if (event.relatedTarget instanceof HTMLInputElement || event.relatedTarget instanceof HTMLButtonElement) {
                this.trigger.closePanel();
                // check value for actions within focusing event
                this.checkValue();
            }
            this.cdRef.detectChanges();
            this.blur.emit(event);
        }
    }


    @Input('xc-form-autocomplete-asinput')
    set asInput(value: boolean) {
        this._asInput = coerceBoolean(value);
    }


    get asInput(): boolean {
        return this._asInput;
    }


    @HostBinding('class.as-dropdown')
    @Input('xc-form-autocomplete-asdropdown')
    set asDropdown(value: boolean) {
        this._asDropdown = coerceBoolean(value);
        if (this.asDropdown) {
            this.suffix = 'dropdown';
        }
    }


    get asDropdown(): boolean {
        return this._asDropdown;
    }


    @Input('xc-form-autocomplete-casesensitive')
    set caseSensitive(value: boolean) {
        this._caseSensitive = coerceBoolean(value);
    }


    get caseSensitive(): boolean {
        return this._caseSensitive;
    }


    @Input('xc-form-autocomplete-fulltextsearch')
    set fullTextSearch(value: boolean) {
        this._fullTextSearch = coerceBoolean(value);
    }


    get fullTextSearch(): boolean {
        return this._fullTextSearch;
    }


    @Input('xc-form-autocomplete-option')
    set option(value: XcOptionItem) {
        this.selectedOption = value;
        this.value = value;
    }


    get option(): XcOptionItem {
        return this.selectedOption;
    }


    @Input('xc-form-autocomplete-options')
    set options(value: XcOptionItem[]) {
        this._options = value as XcOptionInternalAutocompleteItem[];
        this.updateFilteredOptions.next(this.selectedOption ?? this.value);
    }


    get options(): XcOptionItem[] {
        return this._options;
    }


    @Input('xc-form-autocomplete-sortdirection')
    set sortDirection(value: string) {
        this._sortDirection = XcSortDirectionFromString(value);
        this.updateFilteredOptions.next(this.selectedOption);
    }


    get sortDirection(): string {
        return XcSortDirection[this._sortDirection];
    }


    get stringValue(): string {
        return (
            isObject(this.value)
                ? this.value.name
                : this.value
        ) ?? '';
    }


    /**
     * Active option chosen by arrow keys (not to be confused with selected option)
     */
    get activeOption(): XcOptionItem {
        return this.trigger?.activeOption?.value;
    }


    optionSelected(option: MatOption) {
        this.select(this.value);
        // deselect active option, since we don't want that feature here
        option.deselect();
    }


    openedAutocomplete() {
        // listen to scroll events to close the options and avoiding that the autocomplete scrolls away
        window.addEventListener('scroll', this.onScrollIfAutocompleteIsOpen, true);
        // restore active item to previously selected item
        if (!this.asInput) {
            this.setActiveItem(Math.max(this.selectedIdx, 0) || this.enabledIdx);
        }
        this.selectedIdxResettable = false;
        // emit event
        this.optionsOpened.emit();
        this.cdRef.detectChanges();

        // decide, if tooltip is needed
        // ----------------------------

        // getting the listbox, in which all option elements are
        const listbox = document.body.querySelector('#' + this.trigger.autocomplete.id);

        Array.from(listbox.children).forEach((matOptionElement: HTMLElement) => {
            // which option's box is too small for its content

            const mouseEnterMatOptionOneTimeListener = () => {
                // remove event listener because we need to calculate test overflow only once
                matOptionElement.removeEventListener('mouseenter', mouseEnterMatOptionOneTimeListener);

                // test if text is overflowing
                // ---------------------------

                // get the html element that holds the text of a XcOptionItem.name
                const subElements = Array.from(matOptionElement.querySelectorAll('*'));
                subElements.forEach(el => {
                    const childNodes = Array.from((el as HTMLElement).childNodes);
                    childNodes.forEach(childNode => {
                        if (childNode.nodeType === childNode.TEXT_NODE) {
                            const option = this.options.find(op => op.name === childNode.nodeValue) as XcOptionInternalAutocompleteItem;
                            if (option) {

                                const isOverflowing = isTextOverflowing(childNode.parentElement, option.name);

                                // is there change
                                if (!!option.showTooltip !== isOverflowing) {
                                    option.showTooltip = isOverflowing;
                                    this.cdRef.detectChanges();
                                    if (option.showTooltip) {
                                        const mouseEnterEvent = new MouseEvent('mouseenter');
                                        matOptionElement.dispatchEvent(mouseEnterEvent);
                                    } else {
                                        const mouseLeaveEvent = new MouseEvent('mouseleave');
                                        matOptionElement.dispatchEvent(mouseLeaveEvent);
                                    }
                                }
                            }
                        }
                    });
                });
            };

            matOptionElement.addEventListener('mouseenter', mouseEnterMatOptionOneTimeListener);
        });
    }


    closedAutocomplete() {
        // do not listen anymore, because the listener is expensive
        window.removeEventListener('scroll', this.onScrollIfAutocompleteIsOpen, true);
        // emit event
        this.optionsClosed.emit();
        this.cdRef.detectChanges();
        this.openPanelWasJustClosed = true;
    }


    optionName(option: XcOptionItem): string {
        return option ? option.name : '';
    }

    selectedOptionsMulti: XcOptionItem[] = [];

    @Input('xc-form-autocomplete-asmultiselect')
    set multiSelect(value: boolean) {
        this._filterMultiSelect = coerceBoolean(value);
    }

    @Input('xc-form-autocomplete-reset')
    set reset(value: boolean) {
        if (coerceBoolean(value)) {
            this.value = false;
            setTimeout(() => {
                this.resetMultiselectCheckboxes();
                this.cdRef.detectChanges();
            });
        }
    }

    get multiSelect(): boolean {
        return this._filterMultiSelect;
    }
    
    private _filterMultiSelect = false;
    filteredMultiSelectOptions: XcOptionItem[] = [];

    removeSelectedItem(item: XcOptionItem) {
        this.selectedOptionsMulti = this.selectedOptionsMulti.filter(i => i.value !== item.value);
    
        const joinedName = this.selectedOptionsMulti.map(opt => opt.name).join(' | ');
        const joinedValue = this.selectedOptionsMulti.map(opt => opt.value).join(' | ');
    
        const combinedOption: XcOptionItem = {
            name: joinedName,
            value: joinedValue
        };
    
        this.selectedOption = combinedOption;
        this.value = combinedOption;
        this.optionChange.emit(combinedOption);
    
        this.cdRef.detectChanges();
    }

    isOptionSelected(option: XcOptionItem): boolean {
        return this.selectedOptionsMulti?.some(o => o.value === option.value);
    }

    @ViewChild('multiSelectDropdown', { static: false }) multiSelectDropdown: MatSelect;
    multiSelectControl = new FormControl<string[]>([]);
    multiSelectInputControl = new FormControl('');
    private tempMultiSelect: string[] = [];
    private lastAppliedMultiSelect: string[] = [];

    ngOnInit() {
        // Initialize filtered options
        if (this.multiSelect) {
            this.filteredMultiSelectOptions = this.options || [];
            this.multiSelectInputControl.valueChanges.subscribe(val => {
                const filterValue = val ? val.toLowerCase() : '';
                this.filteredMultiSelectOptions = (this.options || []).filter(opt =>
                    opt.name.toLowerCase().includes(filterValue)
                );
            });
            // Store initial applied values
            this.lastAppliedMultiSelect = this.multiSelectControl.value ? [...this.multiSelectControl.value] : [];
        }
    }

    getMultiSelectedNames(): string {
        const values = Array.isArray(this.multiSelectControl.value) ? this.multiSelectControl.value : [];
        return values
            .map(val => {
                const found = this.options.find(opt => opt.value === val);
                return found ? found.name : '';
            })
            .filter(Boolean)
            .join(' | ');
    }

    openMultiSelectDropdown() {
        if (this.multiSelectDropdown && !this.multiSelectDropdown.disabled) {
            this.multiSelectDropdown.open();
        }
    }

    onMultiSelectOpened(opened: boolean) {
        if (opened) {
            this.tempMultiSelect = [...(this.multiSelectControl.value || [])];
        } else {
            // If closed without clicking Apply, restore last applied values
            this.multiSelectControl.setValue([...this.lastAppliedMultiSelect]);
            this.multiSelectInputControl.setValue('');
            this.filteredMultiSelectOptions = this.options || [];
        }
    }

    applyMultiSelect() {
        const selectedValues: string[] = Array.isArray(this.multiSelectControl.value) ? this.multiSelectControl.value : [];
        const joinedNames = selectedValues
            .map(val => {
                const found = this.options.find(opt => opt.value === val);
                return found ? found.name : '';
            })
            .filter(Boolean)
            .join(' | ');
        const joinedValue = selectedValues.join('|');
        this.optionChange.emit({ name: joinedNames, value: joinedValue });
        // Store applied values
        this.lastAppliedMultiSelect = [...selectedValues];
        if (this.multiSelectDropdown) {
            this.multiSelectDropdown.close();
        }
    }

    cancelMultiSelect() {
        // Restore previous selection
        this.multiSelectControl.setValue([...this.lastAppliedMultiSelect]);
        this.multiSelectInputControl.setValue('');
        this.filteredMultiSelectOptions = this.options || [];
        if (this.multiSelectDropdown) {
            this.multiSelectDropdown.close();
        }
    }
    
    resetMultiselectCheckboxes(): void {
        this.multiSelectControl?.setValue([]);
        this.multiSelectInputControl.setValue('');
        this.filteredMultiSelectOptions = this.options || [];
        this.lastAppliedMultiSelect = [];
        this.multiSelectDropdown?.options.forEach(option => option.deselect());
    }
}