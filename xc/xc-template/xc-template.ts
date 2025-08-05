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
import { InjectionToken, Injector } from '@angular/core';
import { ValidatorFn } from '@angular/forms';

import { Observable, Subject } from 'rxjs';

import { XcDataWrapper } from '../shared/xc-data-wrapper';
import { XcDynamicComponentType } from '../shared/xc-dynamic.component';
import { XcOptionItem, XcOptionItemValueType } from '../shared/xc-item';
import { XcColor } from '../shared/xc-themeable.component';
import { XcAutocompleteDataWrapper } from '../xc-form/xc-form-autocomplete/xc-form-autocomplete.component';
import { FloatStyle, XcFormBaseComponent } from '../xc-form/xc-form-base/xc-form-base.component';
import { XcFormValidatorRequired } from '../xc-form/xc-form-base/xc-form-validators.directive';


export abstract class XcTemplate {
    label = '';
    disabled = false;
    stylename = '';

    private readonly _markForCheckSubject = new Subject();


    triggerMarkForCheck() {
        this._markForCheckSubject.next(null);
    }


    get markedForCheck(): Observable<unknown> {
        return this._markForCheckSubject.asObservable();
    }
}


export abstract class XcDataTemplate<D, S, W extends XcDataWrapper<D, S> = XcDataWrapper<D, S>> extends XcTemplate {
    constructor(public dataWrapper: W) {
        super();
    }
}


export abstract class XcFormTemplate<D, S, W extends XcDataWrapper<D, S> = XcDataWrapper<D, S>> extends XcDataTemplate<D, S, W> {
    callback: (formBaseComponent: XcFormBaseComponent) => void = null;
    indicateChanges = false;
    compact = false;
    placeholder = '';
    suffix = '';
    tooltip = '';
    filterMultiselect = false;
    floatLabel: FloatStyle = FloatStyle.always;
    required: boolean;

    constructor(dataWrapper: W, public validators: ValidatorFn[] = []) {
        super(dataWrapper);

        this.required = validators.findIndex(v => v.name === XcFormValidatorRequired.name) >= 0;
    }
}


export class XcFormTextTemplate extends XcFormTemplate<string, any> {
}


/**
 * Key and value
 * Creates a pair of dt and dd elements without being wrapped into a DOM-component-element
 */
export class XcDefinitionListEntryTemplate extends XcTemplate {
    constructor(label: string, public data: XcTemplate | string) {
        super();
        this.label = label;
    }
}


export class XcFormAutocompleteTemplate extends XcFormTemplate<XcOptionItem, XcOptionItemValueType, XcAutocompleteDataWrapper> {
    asInput = false;
    asDropdown = false;
    asMultiselect = false;
    reset = false; 
    
    constructor(autocompleteDataWrapper: XcAutocompleteDataWrapper, validators: ValidatorFn[] = []) {
        super(autocompleteDataWrapper, validators);
    }
}


export class XcFormInputTemplate extends XcFormTemplate<string, any> {
    type: 'text' | 'password' = 'text';
}


export class XcFormTextAreaTemplate extends XcFormTemplate<string, any> {
    lines = 5;
}


export class XcCheckboxTemplate extends XcDataTemplate<boolean, any> {
    color: XcColor = 'normal';
    indeterminate = false;
}


export class XcButtonBaseTemplate extends XcTemplate {
    color: XcColor = 'normal';
    iconName = '';
    iconStyle = '';
    iconSize = 'medium';
    busy = false;
    action = () => {
        // no default implementation
    };
}


export class XcButtonTemplate extends XcButtonBaseTemplate {
}


export class XcIconButtonTemplate extends XcButtonBaseTemplate {
}


/** Injection token that can be used to access the data that was passed in to a component. */
export const XC_COMPONENT_DATA = new InjectionToken<any>('XcComponentData');

export class XcComponentTemplate<D> extends XcTemplate {
    private _componentInjector: Injector;

    constructor(public component: XcDynamicComponentType<D>, public data: D) {
        super();
    }

    getComponentInjector(parent: Injector): Injector {
        if (!this._componentInjector) {
            this._componentInjector = Injector.create({
                providers: [{ provide: XC_COMPONENT_DATA, useValue: this.data }],
                parent: parent
            });
        }
        return this._componentInjector;
    }
}
