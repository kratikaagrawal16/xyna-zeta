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
import { CollectionViewer } from '@angular/cdk/collections';
import { DataSource } from '@angular/cdk/table';

import { BehaviorSubject, EMPTY, merge, Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';


export abstract class XcDataSource<T> extends DataSource<T> {

    /** Behavior subject holding the data source's data */
    private readonly _dataSubject = new BehaviorSubject<T[]>([]);

    /** Subject for the mark for change trigger */
    private readonly _markForSubject = new Subject<void>();

    private readonly _markForReset = new Subject<void>();

    /** Determines how many refreshing calls are pending */
    private _refreshCounter = 0;


    /**
     * Returns currently set data directly from subject
     * @returns Data
     */
    protected get data(): T[] {
        return this._dataSubject.value;
    }


    /**
     * Sets new data directly to subject notifying all observers
     * @param value Data
     */
    protected set data(value: T[]) {
        if (this.refreshing) {
            this._refreshCounter--;
        }
        this.beforeSetData(value);
        this._dataSubject.next(value);
        this.triggerMarkForChange();
    }


    /**
     * Callback just before setting new data to the subject notifying all subscribers
     * @param data New data to be set
     */
    protected beforeSetData(data: T[]) {
    }


    /**
     * Returns observable of subject to be notified of data changes
     */
    get dataChange(): Observable<T[]> {
        return this._dataSubject.asObservable();
    }


    /**
     * Returns whether the data source is currently refreshing
     */
    get refreshing(): boolean {
        return this._refreshCounter > 0;
    }


    /**
     * Returns mark for change observable
     */
    get markForChange(): Observable<void> {
        return this._markForSubject.asObservable();
    }

    get markForReset(): Observable<void> {
        return this._markForReset.asObservable();
    }

    /**
     * Triggers a mark for change, so the view component can perform a change detection cycle
     */
    triggerMarkForChange() {
        this._markForSubject.next();
    }

    triggerMarkForReset() {
        this._markForReset.next();
    }

    /**
     * Refreshes the data source, e. g. making server call to fetch new data
     */
    refresh() {
        this._refreshCounter++;
        this.triggerMarkForChange();
    }


    /**
     * Connect to data source by subscribing to returned observable
     * @param collectionViewer Collection viewer that connects to data source
     * @returns Observable
     */
    connect(collectionViewer: CollectionViewer): Observable<T[]> {
        const viewChange = collectionViewer
            ? collectionViewer.viewChange.pipe(map(() => this.data))
            : EMPTY;
        return merge(viewChange, this.dataChange);
    }


    /**
     * Disconnect from data source
     * @param collectionViewer Collection viewer that disconnects from data source
     */
    disconnect(collectionViewer: CollectionViewer) {
        // nothing to do here
    }
}
